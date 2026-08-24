import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {Prisma} from "@prisma/client/extension";
import {paginate} from "@utils/pagination";
import {COMMENT_INCLUDE, ISSUE_INCLUDE, serializeComment, serializeIssue} from "@utils/serialize";
import {diffChange, recordActivities, type ActivityChange} from "@utils/activity";
import {applyIssueFilters, normalizeFilters, restringirAoGrupo} from "@utils/filters";
import {
  EProjectAction,
  canTransition,
  requireOwnOrAll,
  requireProjectAction,
  resolveRole,
  roleCan,
} from "@utils/permission-checks";
import {campoDeAtividade, pontoDoProjeto, type PontoDeEstimativa} from "@utils/estimate";
import {resolverOrdenacao} from "@utils/issue-order";
import {acompanharSolicitacao} from "@utils/atendimento-da-solicitacao";
import {replicateToLinkedIntakes} from "@utils/intake-replication";
import {notifyStateChange} from "@utils/notifications";
import {publishRealtime} from "@utils/realtime";
import {AUDIT_ACTIONS, AUDIT_ENTITIES, auditDiff, clientIp, recordAudit} from "@utils/audit";
import {registrarVersaoDaDescricao, serializarVersao} from "@utils/versoes-da-descricao";
import {nextSequenceId} from "@utils/sequence";
import {computeTargetDate} from "@utils/sla";
import {inicioRecebido, vencimentoRecebido} from "@utils/prazo";
import {sincronizarEtiquetas, sincronizarResponsaveis} from "@utils/vinculos-do-chamado";
import {getProjectOrFail, getWorkspaceOrFail} from "@utils/workspace";
import Elysia from "elysia";

// State-transition rules are now data-driven (utils/permission-checks.ts), seeded
// per workspace and editable through the roles API. See utils/permissions.ts for
// the default matrix.

// Reverse of each relation type (mirrors REVERSE_RELATIONS on the frontend).
const RELATION_REVERSE: Record<string, string> = {
  blocking: "blocked_by",
  blocked_by: "blocking",
  duplicate: "duplicate",
  relates_to: "relates_to",
};

// serializeIssue, ISSUE_INCLUDE, isoDate, dateOnly imported from @utils/serialize

export const issueModule = new Elysia({prefix: "/workspaces/:slug/projects/:project_id/issues"})
  .use(authPlugin)

  // GET /:issue_id/meta/ — minimal payload for redirect (project_identifier + sequence_id)
  .get("/:issue_id/meta/", async ({params: {slug, project_id, issue_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirst({
      where: {id: issue_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
      include: {project: {select: {identifier: true}}},
    });
    if (!issue) {
      set.status = 404;
      return {detail: "Chamado não encontrado."};
    }
    return {project_identifier: issue.project?.identifier ?? "", sequence_id: String(issue.sequenceId)};
  })

  .get("/", async ({params: {slug, project_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    const {member} = await getProjectOrFail(ws.id, project_id, user.id);

    // Chamado arquivado sai da listagem normal — ele tem tela própria em
    // /archives/issues. Sem este recorte, arquivar não muda nada na prática.
    const where: any = {projectId: project_id, deletedAt: null, isDraft: false, archivedAt: null};

    // Non-filter scalar params that are not part of the filter map.
    // `entity_id` is handled by normalizeFilters/applyIssueFilters below so it
    // accepts both a single id and a CSV list from the work-item filter panel.
    if (query.legacy_ticket_number) where.legacyTicketNumber = query.legacy_ticket_number;

    // Parse the frontend `filters` JSON param (+ loose params) and apply it
    const filters = normalizeFilters(query as Record<string, unknown>);
    await applyIssueFilters(where, filters, {projectId: project_id});

    // Quem participa do projeto enxerga TODOS os chamados, em qualquer etapa.
    // O recorte por setor virou filtro (templates prontos na UI), não regra de
    // visibilidade — antes o TI simplesmente não via o que estava em Triagem.

    // Ordenação — mapa compartilhado (@utils/issue-order), o mesmo usado pelas
    // listagens de espaço de trabalho, para que `estimate_point__key` e amigos
    // funcionem em todas elas.
    const orderBy = resolverOrdenacao(query.order_by, {createdAt: "desc"});

    const perPage = Number(query.per_page ?? 30);
    const groupBy = query.group_by as string | undefined;

    // ── Grouped response (for kanban/groupBy views) ───────────────────────────
    if (groupBy) {
      const groupByMap: Record<string, string> = {
        state_id: "stateId",
        priority: "priority",
        state__group: "stateGroup", // handled specially
        created_by: "createdById",
        project_id: "projectId",
      };

      const prismaField = groupByMap[groupBy];

      // Get all distinct group values
      let groupValues: (string | null)[] = [];

      if (groupBy === "state_id") {
        const states = await prisma.state.findMany({
          where: {projectId: project_id, deletedAt: null},
          select: {id: true},
          orderBy: {sequence: "asc"},
        });
        groupValues = states.map((s: any) => s.id);
      } else if (groupBy === "priority") {
        groupValues = ["urgent", "high", "medium", "low", "none"];
      } else if (groupBy === "state__group") {
        groupValues = ["backlog", "unstarted", "started", "completed", "cancelled", "triage"];
      } else {
        const distinct = await prisma.issue.findMany({
          where,
          select: {[prismaField ?? "stateId"]: true},
          distinct: [prismaField ?? "stateId"] as any,
        });
        groupValues = distinct.map((d: any) => d[prismaField ?? "stateId"]).filter(Boolean);
      }

      const total_count = await prisma.issue.count({where});
      const results: Record<string, any> = {};

      for (const gv of groupValues) {
        const groupWhere: any = {...where};

        if (groupBy === "state_id") groupWhere.stateId = restringirAoGrupo(where.stateId, gv);
        else if (groupBy === "priority") groupWhere.priority = restringirAoGrupo(where.priority, gv);
        else if (groupBy === "state__group") {
          const stateIds = await prisma.state.findMany({
            where: {projectId: project_id, group: gv as string, deletedAt: null},
            select: {id: true},
          });
          groupWhere.stateId = restringirAoGrupo(where.stateId, stateIds.map((s: any) => s.id));
        }

        const [groupIssues, groupCount] = await Promise.all([
          prisma.issue.findMany({where: groupWhere, include: ISSUE_INCLUDE, orderBy, take: perPage}),
          prisma.issue.count({where: groupWhere}),
        ]);

        results[gv ?? "none"] = {
          results: groupIssues.map(serializeIssue),
          total_results: groupCount,
          next_cursor: `${perPage}:1:0`,
          prev_cursor: `${perPage}:0:1`,
          next_page_results: groupCount > perPage,
          prev_page_results: false,
        };
      }

      return {total_count, results, next_cursor: null, prev_cursor: null, next_page_results: false, prev_page_results: false};
    }

    // ── Flat (non-grouped) paginated response ──────────────────────────────────
    return paginate({
      query: (skip, take) => prisma.issue.findMany({where, skip, take, include: ISSUE_INCLUDE, orderBy}),
      count: () => prisma.issue.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  .post("/", async ({params: {slug, project_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    // D2: Atendimento (6) opens intakes through /inbox-issues/, never work items;
    // Visualizador (5) creates nothing. Both lack ISSUE_CREATE.
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_CREATE);

    const b = body as any;
    if (!b.name) {
      set.status = 400;
      return {detail: "O nome é obrigatório."};
    }

    const defaultState = await prisma.state.findFirst({
      where: {projectId: project_id, default: true, deletedAt: null},
    });

    // Ponto de estimativa: o front manda o id em `estimate_point`. Só vale um
    // ponto de estimativa DESTE projeto — id estrangeiro é erro do cliente.
    const pontoPedido = b.estimate_point !== undefined ? b.estimate_point : b.estimate_point_id;
    let ponto: PontoDeEstimativa | null = null;
    if (pontoPedido) {
      ponto = await pontoDoProjeto(project_id, String(pontoPedido));
      if (!ponto) {
        set.status = 400;
        return {detail: "O ponto de estimativa não pertence a uma estimativa deste projeto."};
      }
    }

    const issue = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Per-project sequence number (e.g. CONTAB-12). Computed inside the
      // transaction so concurrent creates don't both read the same max.
      const sequenceId = await nextSequenceId(tx, project_id);

      const created = await tx.issue.create({
        data: {
          projectId: project_id,
          workspaceId: ws.id,
          sequenceId,
          name: b.name,
          descriptionHtml: b.description_html ?? "<p></p>",
          descriptionStripped: (b.description_html ?? "").replace(/<[^>]+>/g, ""),
          descriptionJson: b.description ?? null,
          // Frontend sends `state_id`; `state` is the Django-legacy alias. Honor either.
          // Use `||` so an empty string ("") falls through to the default state /
          // null instead of being sent to Postgres as an invalid uuid.
          stateId: b.state || b.state_id || defaultState?.id || null,
          priority: b.priority ?? "none",
          // Datas puras ganham a borda do dia que corresponde ao seu sentido —
          // início começa de manhã, vencimento vale até o fim do dia. Ver @utils/prazo.
          startDate: inicioRecebido(b.start_date),
          targetDate: vencimentoRecebido(b.target_date),
          isDraft: b.is_draft ?? false,
          estimatePointId: ponto?.id ?? null,
          entityId: b.entity_id || null,
          legacyTicketNumber: b.legacy_ticket_number ?? null,
          externalSource: b.external_source ?? null,
          externalId: b.external_id ?? null,
          createdById: user.id,
        },
        include: ISSUE_INCLUDE,
      });

      // Frontend sends `assignee_ids`/`label_ids`; accept the legacy names too.
      const assigneeIds: string[] = b.assignee_ids ?? b.assignees ?? [];
      const labelIds: string[] = b.label_ids ?? b.labels ?? [];

      const escopo = {issueId: created.id, workspaceId: ws.id, projectId: project_id};
      // Auto-assign creator (premium feature recreation)
      // Merge creator into assignees list automatically
      await sincronizarResponsaveis(escopo, [user.id, ...assigneeIds], tx);
      if (labelIds.length) await sincronizarEtiquetas(escopo, labelIds, tx);
      return created;
    });

    // SLA (C): auto due date from label deadlines + priority when none was given.
    const createLabelIds: string[] = b.label_ids ?? b.labels ?? [];
    let createdIssue = issue;
    if (!b.target_date && createLabelIds.length) {
      const auto = await computeTargetDate(createLabelIds, b.priority ?? "none", issue.createdAt ?? new Date());
      if (auto) createdIssue = await prisma.issue.update({where: {id: issue.id}, data: {targetDate: auto}, include: ISSUE_INCLUDE});
    }

    await recordActivities({issueId: issue.id, workspaceId: ws.id, projectId: project_id, actorId: user.id}, [
      {verb: "created", field: "issue", comment: "created the work item"},
      ...(ponto
        ? [{field: campoDeAtividade(ponto.tipo), newValue: ponto.value, comment: "updated the estimate point"}]
        : []),
    ]);

    publishRealtime(ws.id, {entity: "issue", action: "create", project_id, id: issue.id, actor: user.id});

    // LGPD: abertura de chamado é tratamento de dado pessoal do solicitante.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: issue.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: user,
      headers,
      metadata: {project_id, sequence_id: issue.sequenceId, name: issue.name},
    });

    set.status = 201;
    return serializeIssue(createdIssue);
  })

  .get("/:issue_id", async ({params: {slug, project_id, issue_id}, user, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirstOrThrow({
      where: {id: issue_id, projectId: project_id, deletedAt: null},
      include: ISSUE_INCLUDE,
    });
    // LGPD: acesso a dado também é tratamento — quem abriu qual chamado, quando e de onde.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: issue.id,
      action: AUDIT_ACTIONS.VIEW,
      actor: user,
      headers,
      metadata: {project_id, sequence_id: issue.sequenceId},
    });
    return serializeIssue(issue);
  })

  .patch("/:issue_id", async ({params: {slug, project_id, issue_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);

    // Snapshot the issue before mutation so we can log activity diffs afterwards
    // (also used to resolve own-vs-any edit rights).
    const before = await prisma.issue.findFirst({
      where: {id: issue_id},
      include: {
        state: {select: {id: true, name: true, group: true}},
        estimatePoint: {select: {id: true, value: true, estimate: {select: {type: true}}}},
      },
    });

    // Editing any work item needs ISSUE_EDIT_ALL; authors get by with
    // ISSUE_EDIT_OWN. Visualizador (5) holds neither.
    const {member} = await requireOwnOrAll(
      ws.id,
      project_id,
      user.id,
      before?.createdById,
      EProjectAction.ISSUE_EDIT_OWN,
      EProjectAction.ISSUE_EDIT_ALL,
    );

    const b = body as any;

    // Use unchecked scalar fields throughout (updatedById/stateId/entityId/parentId).
    // Mixing relation-style connects (e.g. updatedBy:{connect}) forces Prisma's
    // checked input type, which then rejects scalar FKs like `stateId`.
    const data: any = {updatedById: user.id};
    if (b.name !== undefined) data.name = b.name;
    if (b.description_html !== undefined) {
      data.descriptionHtml = b.description_html;
      data.descriptionStripped = b.description_html.replace(/<[^>]+>/g, "");
    }
    // O JSON do editor acompanha o HTML. Sem gravá-lo, o "estado anterior" de
    // toda versão guardaria para sempre o JSON da criação. `description` é o
    // nome legado do campo, aceito na criação e aqui também.
    const descricaoJson = b.description_json !== undefined ? b.description_json : b.description;
    if (descricaoJson !== undefined) data.descriptionJson = descricaoJson;
    // Accept both `state` (Django legacy) and `state_id` (frontend ISSUE_FILTER_DEFAULT_DATA)
    const newStateId = b.state ?? b.state_id;
    let targetState: {id: string; name: string; group: string} | null = null;
    if (newStateId !== undefined) {
      // Validate state transition against the role's configurable workflow (H3)
      targetState = await prisma.state.findFirst({where: {id: newStateId}, select: {id: true, name: true, group: true}});
      if (before && targetState) {
        const role = await resolveRole(ws.id, member.role, (member as any).workflowRoleId);
        const allowed = await canTransition(
          role,
          {group: before.state?.group ?? "backlog", name: before.state?.name ?? ""},
          {group: targetState.group, name: targetState.name},
        );
        if (!allowed) {
          set.status = 403;
          return {detail: "Sua função não permite esta transição de estado."};
        }
      }
      data.stateId = newStateId;
    }
    if (b.priority !== undefined) data.priority = b.priority;
    if (b.start_date !== undefined) data.startDate = inicioRecebido(b.start_date);
    if (b.target_date !== undefined) data.targetDate = vencimentoRecebido(b.target_date);
    const entityIdValue = b.entity_id ?? b.entityId;
    if (entityIdValue !== undefined) {
      data.entityId = entityIdValue || null;
    }
    // Ponto de estimativa: id vazio/nulo limpa o campo; id preenchido precisa
    // ser de uma estimativa deste projeto.
    const pontoPedido = b.estimate_point !== undefined ? b.estimate_point : b.estimate_point_id;
    let pontoNovo: PontoDeEstimativa | null = null;
    if (pontoPedido !== undefined) {
      if (pontoPedido) {
        pontoNovo = await pontoDoProjeto(project_id, String(pontoPedido));
        if (!pontoNovo) {
          set.status = 400;
          return {detail: "O ponto de estimativa não pertence a uma estimativa deste projeto."};
        }
      }
      data.estimatePointId = pontoNovo?.id ?? null;
    }
    if (b.legacy_ticket_number !== undefined) data.legacyTicketNumber = b.legacy_ticket_number;
    if (b.sort_order !== undefined) data.sortOrder = b.sort_order;
    // b.type_id intentionally skipped — typeId not in current Prisma client
    if (b.is_draft !== undefined) data.isDraft = b.is_draft;
    if (b.parent_id !== undefined) data.parentId = b.parent_id;
    if (b.completed_at !== undefined) data.completedAt = b.completed_at ? new Date(b.completed_at) : null;

    // Todos podem reescrever o corpo do chamado; o que era antes fica gravado.
    // Ver @utils/versoes-da-descricao.
    const abriuVersao = await registrarVersaoDaDescricao({antes: before, corpo: b, autorId: user.id});

    await prisma.issue.update({where: {id: issue_id}, data});

    // Frontend sends `assignee_ids`/`label_ids`; accept the legacy names too.
    const newAssignees: string[] | undefined = b.assignee_ids ?? b.assignees;
    const newLabels: string[] | undefined = b.label_ids ?? b.labels;

    // Sincronização idempotente: reaproveita a linha existente em vez de
    // apagar tudo e recriar — ver @utils/vinculos-do-chamado.
    const escopoDoVinculo = {issueId: issue_id, workspaceId: ws.id, projectId: project_id};
    if (newAssignees !== undefined) await sincronizarResponsaveis(escopoDoVinculo, newAssignees);
    if (newLabels !== undefined) await sincronizarEtiquetas(escopoDoVinculo, newLabels);

    // Whoever moves the card (changes its state) is auto-added as an assignee, so
    // the person who advanced the work item is recorded as responsible for it.
    if (newStateId !== undefined && before && before.stateId !== newStateId) {
      const already = await prisma.issueAssignee.findFirst({
        where: {issueId: issue_id, assigneeId: user.id, deletedAt: null},
        select: {id: true},
      });
      if (!already) {
        await prisma.issueAssignee.create({
          data: {issueId: issue_id, assigneeId: user.id, workspaceId: ws.id, projectId: project_id},
        });
      }
    }

    // SLA (C): recompute the auto due date when labels/priority change and the
    // caller did not explicitly set target_date.
    if (b.target_date === undefined && (newLabels !== undefined || b.priority !== undefined) && before) {
      const labelIds: string[] =
        newLabels !== undefined
          ? newLabels
          : (await prisma.issueLabel.findMany({where: {issueId: issue_id, deletedAt: null}, select: {labelId: true}})).map((l) => l.labelId);
      const auto = await computeTargetDate(labelIds, b.priority ?? before.priority, before.createdAt ?? new Date());
      if (auto) await prisma.issue.update({where: {id: issue_id}, data: {targetDate: auto}});
    }

    // ── Activity log ──────────────────────────────────────────────────────────
    if (before) {
      const changes: ActivityChange[] = [];
      if (newStateId !== undefined && before.stateId !== newStateId) {
        changes.push({
          field: "state",
          oldValue: before.state?.name ?? null,
          newValue: targetState?.name ?? null,
          comment: "updated the state",
        });
      }
      if (b.name !== undefined) {
        const c = diffChange("name", before.name, b.name, "updated the name");
        if (c) changes.push(c);
      }
      // O corpo alterado entra na trilha uma vez por sessão de edição — mesmo
      // agrupamento da versão, senão cada autosave viraria uma linha. O texto
      // antigo e o novo ficam na versão, que é onde se lê o que mudou.
      if (abriuVersao) changes.push({field: "description", comment: "updated the description"});
      if (b.priority !== undefined) {
        const c = diffChange("priority", before.priority, b.priority, "updated the priority");
        if (c) changes.push(c);
      }
      if (b.target_date !== undefined) {
        // Instante inteiro, não só o dia: antecipar o prazo de 18h para 14h no
        // mesmo dia é uma mudança real e não aparecia na trilha.
        const oldTd = before.targetDate ? before.targetDate.toISOString() : null;
        const newTd = vencimentoRecebido(b.target_date)?.toISOString() ?? null;
        const c = diffChange("target_date", oldTd, newTd, "updated the due date");
        if (c) changes.push(c);
      }
      if (b.start_date !== undefined) {
        const oldSd = before.startDate ? before.startDate.toISOString().split("T")[0] : null;
        const newSd = b.start_date ? new Date(b.start_date).toISOString().split("T")[0] : null;
        const c = diffChange("start_date", oldSd, newSd, "updated the start date");
        if (c) changes.push(c);
      }
      if (b.parent_id !== undefined) {
        const c = diffChange("parent", before.parentId, b.parent_id, "updated the parent");
        if (c) changes.push(c);
      }
      if (pontoPedido !== undefined && before.estimatePointId !== (pontoNovo?.id ?? null)) {
        // O histórico mostra o rótulo do ponto ("5", "M"), não o uuid.
        const tipo = pontoNovo?.tipo ?? before.estimatePoint?.estimate?.type;
        changes.push({
          verb: pontoNovo ? "updated" : "removed",
          field: campoDeAtividade(tipo),
          oldValue: before.estimatePoint?.value ?? null,
          newValue: pontoNovo?.value ?? null,
          comment: "updated the estimate point",
        });
      }
      if (newAssignees !== undefined) changes.push({field: "assignees", comment: "updated the assignees"});
      if (newLabels !== undefined) changes.push({field: "labels", comment: "updated the labels"});
      await recordActivities({issueId: issue_id, workspaceId: ws.id, projectId: project_id, actorId: user.id}, changes);

      // H4: when completed/cancelled, replicate comments+activities to linked intakes
      if (targetState && (targetState.group === "completed" || targetState.group === "cancelled")) {
        await replicateToLinkedIntakes(issue_id, targetState.group as "completed" | "cancelled");
      }

      // A solicitação que originou o chamado fecha junto com ele — e reabre se
      // o chamado voltar. Ver @utils/atendimento-da-solicitacao.
      if (targetState) {
        await acompanharSolicitacao({
          issueId: issue_id,
          grupo: targetState.group,
          autorId: user.id,
          workspaceId: ws.id,
          projectId: project_id,
        }).catch((e) => console.error("[acompanharSolicitacao]", e));
      }

      // Andou de etapa: avisa quem tem de agir agora. Falhar aqui não pode
      // desfazer a movimentação — o chamado já mudou de lugar.
      if (targetState && before.state?.name && before.state.name !== targetState.name) {
        await notifyStateChange({
          workspaceId: ws.id,
          projectId: project_id,
          issueId: issue_id,
          actorId: user.id,
          issueName: before.name,
          fromState: before.state.name,
          toState: targetState.name,
        }).catch((e) => console.error("[notifyStateChange]", e));
      }
    }

    publishRealtime(ws.id, {entity: "issue", action: "update", project_id, id: issue_id, actor: user.id});

    // LGPD: mudança de estado para concluído/cancelado é "encerrou o chamado";
    // as demais alterações entram como update com o diff dos campos tocados.
    const closing = targetState && (targetState.group === "completed" || targetState.group === "cancelled");
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: issue_id,
      action: closing ? AUDIT_ACTIONS.CLOSE : newStateId !== undefined ? AUDIT_ACTIONS.STATE_CHANGE : AUDIT_ACTIONS.UPDATE,
      actor: user,
      headers,
      changes: auditDiff(
        {state: before?.state?.name ?? null, name: before?.name, priority: before?.priority},
        {state: targetState?.name ?? before?.state?.name ?? null, name: b.name ?? before?.name, priority: b.priority ?? before?.priority},
        ["state", "name", "priority"]
      ),
      metadata: {project_id, campos: Object.keys(b ?? {})},
    });

    return serializeIssue(await prisma.issue.findFirstOrThrow({where: {id: issue_id}, include: ISSUE_INCLUDE}));
  })

  .delete("/:issue_id", async ({params: {slug, project_id, issue_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const target = await prisma.issue.findFirst({
      where: {id: issue_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
      select: {createdById: true},
    });
    if (!target) {
      set.status = 404;
      return {detail: "Chamado não encontrado."};
    }
    await requireOwnOrAll(
      ws.id,
      project_id,
      user.id,
      target.createdById,
      EProjectAction.ISSUE_DELETE_OWN,
      EProjectAction.ISSUE_DELETE_ALL,
    );
    await prisma.issue.update({where: {id: issue_id}, data: {deletedAt: new Date()}});
    // A solicitação de origem vai junto: sem o chamado não há o que atender.
    await prisma.intakeIssue.updateMany({
      where: {issueId: issue_id, deletedAt: null},
      data: {deletedAt: new Date()},
    });
    publishRealtime(ws.id, {entity: "issue", action: "delete", project_id, id: issue_id, actor: user.id});
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: issue_id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      headers,
      metadata: {project_id},
    });
    set.status = 204;
    return null;
  })

  // Comments ─────────────────────────────────────────────────────────────────

  // ── Arquivo ───────────────────────────────────────────────────────────────
  // A interface já oferecia "Arquivar" e a tela de arquivados, mas não existia
  // backend nenhum: a tela quebrava com NOT_FOUND e o botão não fazia efeito.

  .post("/:issue_id/archive/", async ({params: {slug, project_id, issue_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const issue = await prisma.issue.findFirst({where: {id: issue_id, projectId: project_id, deletedAt: null}});
    if (!issue) {
      set.status = 404;
      return {detail: "Chamado não encontrado."};
    }
    // Arquivar tira o chamado da listagem: exige o mesmo poder de editar.
    await requireOwnOrAll(
      ws.id,
      project_id,
      user.id,
      issue.createdById,
      EProjectAction.ISSUE_EDIT_OWN,
      EProjectAction.ISSUE_EDIT_ALL,
    );
    const archivedAt = new Date();
    await prisma.issue.update({where: {id: issue_id}, data: {archivedAt}});
    recordAudit({
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: issue_id,
      actorId: user.id,
      workspaceId: ws.id,
      projectId: project_id,
      ip: clientIp(headers),
      changes: {archived: {de: false, para: true}},
    });
    return {archived_at: archivedAt.toISOString()};
  })

  .delete("/:issue_id/archive/", async ({params: {slug, project_id, issue_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const issue = await prisma.issue.findFirst({where: {id: issue_id, projectId: project_id, deletedAt: null}});
    if (!issue) {
      set.status = 404;
      return {detail: "Chamado não encontrado."};
    }
    await requireOwnOrAll(
      ws.id,
      project_id,
      user.id,
      issue.createdById,
      EProjectAction.ISSUE_EDIT_OWN,
      EProjectAction.ISSUE_EDIT_ALL,
    );
    await prisma.issue.update({where: {id: issue_id}, data: {archivedAt: null}});
    recordAudit({
      action: AUDIT_ACTIONS.UPDATE,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: issue_id,
      actorId: user.id,
      workspaceId: ws.id,
      projectId: project_id,
      ip: clientIp(headers),
      changes: {archived: {de: true, para: false}},
    });
    set.status = 204;
    return null;
  })

  .get("/:issue_id/archive/", async ({params: {slug, project_id, issue_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const issue = await prisma.issue.findFirst({
      where: {id: issue_id, projectId: project_id, deletedAt: null, archivedAt: {not: null}},
      include: ISSUE_INCLUDE,
    });
    if (!issue) {
      set.status = 404;
      return {detail: "Chamado arquivado não encontrado."};
    }
    return serializeIssue(issue);
  })

  .get("/:issue_id/comments/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) =>
        prisma.issueComment.findMany({
          where,
          skip,
          take,
          include: COMMENT_INCLUDE,
          orderBy: {createdAt: "asc"},
        }),
      count: () => prisma.issueComment.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeComment),
    });
  })

  .post("/:issue_id/comments/", async ({params: {slug, project_id, issue_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.COMMENT_CREATE);

    const b = body as any;
    if (!b.comment_html && !b.comment) {
      set.status = 400;
      return {detail: "O conteúdo do comentário é obrigatório."};
    }

    const comment = await prisma.issueComment.create({
      data: {
        issueId: issue_id,
        actorId: user.id,
        workspaceId: ws.id,
        projectId: project_id,
        commentHtml: b.comment_html ?? "<p></p>",
        commentStripped: (b.comment_html ?? "").replace(/<[^>]+>/g, ""),
        commentJson: b.comment ?? null,
        access: b.access ?? "INTERNAL",
        parentId: b.parent ?? null,
        createdById: user.id,
      },
      include: COMMENT_INCLUDE,
    });
    publishRealtime(ws.id, {entity: "comment", action: "create", project_id, issue_id, id: comment.id, actor: user.id});
    // LGPD: interação do usuário no chamado.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.COMMENT,
      entityId: comment.id,
      action: AUDIT_ACTIONS.COMMENT,
      actor: user,
      headers,
      metadata: {project_id, issue_id, acesso: comment.access},
    });
    set.status = 201;
    return serializeComment(comment);
  })

  .patch("/:issue_id/comments/:comment_id/", async ({params: {slug, project_id, issue_id, comment_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const comment = await prisma.issueComment.findFirst({
      where: {id: comment_id, issueId: issue_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
    });
    if (!comment) {
      set.status = 404;
      return {detail: "Comentário não encontrado."};
    }
    // Only the author may rewrite a comment (no role grants "edit anyone's comment").
    if (comment.actorId !== user.id) {
      set.status = 403;
      return {detail: "Somente o autor pode editar o comentário."};
    }
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.COMMENT_EDIT_OWN);

    const b = body as any;
    const data: any = {updatedById: user.id, editedAt: new Date()};

    if (b.comment_html !== undefined) {
      // Snapshot current content as a version before overwriting
      const existing = comment;
      if (existing?.commentHtml && existing.commentHtml !== b.comment_html) {
        await prisma.issueCommentVersion.create({
          data: {commentId: comment_id, commentHtml: existing.commentHtml, editedById: user.id},
        });
      }
      data.commentHtml = b.comment_html;
      data.commentStripped = b.comment_html.replace(/<[^>]+>/g, "");
    }
    if (b.access !== undefined) data.access = b.access;
    const updated = await prisma.issueComment.update({where: {id: comment_id}, data, include: COMMENT_INCLUDE});
    publishRealtime((updated as any).workspaceId, {
      entity: "comment",
      action: "update",
      project_id: (updated as any).projectId,
      issue_id,
      id: comment_id,
      actor: user.id,
    });
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.COMMENT,
      entityId: comment_id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      headers,
      metadata: {project_id, issue_id},
    });
    return serializeComment(updated);
  })

  // Comment version history
  .get("/:issue_id/comments/:comment_id/versions/", async ({params: {slug, project_id, comment_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const versions = await prisma.issueCommentVersion.findMany({
      where: {commentId: comment_id},
      orderBy: {createdAt: "desc"},
      take: 20,
    });
    return versions.map((v: any) => ({
      id: v.id,
      comment_id: v.commentId,
      comment_html: v.commentHtml,
      edited_by: v.editedById,
      created_at: v.createdAt?.toISOString(),
    }));
  })

  .delete("/:issue_id/comments/:comment_id/", async ({params: {slug, project_id, issue_id, comment_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    const comment = await prisma.issueComment.findFirst({
      where: {id: comment_id, issueId: issue_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
    });
    if (!comment) {
      set.status = 404;
      return {detail: "Comentário não encontrado."};
    }
    await requireOwnOrAll(
      ws.id,
      project_id,
      user.id,
      comment.actorId,
      EProjectAction.COMMENT_DELETE_OWN,
      EProjectAction.COMMENT_DELETE_ALL,
    );
    const deleted = await prisma.issueComment.update({where: {id: comment_id}, data: {deletedAt: new Date()}});
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.COMMENT,
      entityId: comment_id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      headers,
      metadata: {project_id, issue_id},
    });
    publishRealtime((deleted as any).workspaceId, {
      entity: "comment",
      action: "delete",
      project_id: (deleted as any).projectId,
      issue_id,
      id: comment_id,
      actor: user.id,
    });
    set.status = 204;
    return null;
  })

  // Activities ───────────────────────────────────────────────────────────────

  .get("/:issue_id/activities/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.issueActivity.findMany({where, skip, take, orderBy: {createdAt: "asc"}}),
      count: () => prisma.issueActivity.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  // Attachments ──────────────────────────────────────────────────────────────

  .get("/:issue_id/attachments/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.issueAttachment.findMany({where, skip, take}),
      count: () => prisma.issueAttachment.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  // Links ────────────────────────────────────────────────────────────────────

  .get("/:issue_id/links/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) => prisma.issueLink.findMany({where, skip, take}),
      count: () => prisma.issueLink.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/links/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const b = body as any;
    if (!b.url) {
      set.status = 400;
      return {detail: "A URL é obrigatória."};
    }
    const link = await prisma.issueLink.create({
      data: {issueId: issue_id, workspaceId: ws.id, projectId: project_id, url: b.url, title: b.title ?? "", metadata: b.metadata ?? {}},
    });
    set.status = 201;
    return link;
  })

  .delete("/:issue_id/links/:link_id/", async ({params: {slug, project_id, issue_id, link_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const link = await prisma.issueLink.findFirst({
      where: {id: link_id, issueId: issue_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
    });
    if (!link) {
      set.status = 404;
      return {detail: "Link não encontrado."};
    }
    await prisma.issueLink.update({where: {id: link_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // Relations ────────────────────────────────────────────────────────────────

  .get("/:issue_id/relations/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id, deletedAt: null};
    return paginate({
      query: (skip, take) =>
        prisma.issueRelation.findMany({
          where,
          skip,
          take,
          include: {relatedIssue: {select: {id: true, name: true, priority: true}}},
        }),
      count: () => prisma.issueRelation.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/:issue_id/relations/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const b = body as any;
    if (!b.related_issue) {
      set.status = 400;
      return {detail: "related_issue é obrigatório."};
    }
    if (!b.relation_type) {
      set.status = 400;
      return {detail: "relation_type é obrigatório."};
    }
    const relation = await prisma.issueRelation.create({
      data: {issueId: issue_id, relatedIssueId: b.related_issue, workspaceId: ws.id, projectId: project_id, relationType: b.relation_type},
    });
    set.status = 201;
    return relation;
  })

  .delete("/:issue_id/relations/:relation_id/", async ({params: {slug, project_id, relation_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const relation = await prisma.issueRelation.findFirst({
      where: {id: relation_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
    });
    if (!relation) {
      set.status = 404;
      return {detail: "Relação não encontrada."};
    }
    await prisma.issueRelation.update({where: {id: relation_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── Description versions (IssueVersion — histórico de edições da descrição) ──
  // Envelope paginado: o seletor de versões lê `results` (TDescriptionVersionsListResponse).
  .get("/:issue_id/description-versions/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = {issueId: issue_id};
    return paginate({
      query: (skip, take) =>
        prisma.issueVersion.findMany({where, orderBy: {lastSavedAt: "desc"}, skip, take}),
      count: () => prisma.issueVersion.count({where}),
      cursor: (query as any).cursor as string | undefined,
      transform: (versions) =>
        versions.map((v: any) => serializarVersao(v, {issueId: issue_id, workspaceId: ws.id, projectId: project_id})),
    });
  })

  .get("/:issue_id/description-versions/:version_id/", async ({params: {slug, project_id, issue_id, version_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const v = await prisma.issueVersion.findFirst({where: {id: version_id, issueId: issue_id}});
    if (!v) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    return serializarVersao(v, {issueId: issue_id, workspaceId: ws.id, projectId: project_id});
  })

  // ── History / Activity ────────────────────────────────────────────────────────
  // Handles both `activity_type=issue-property` and `activity_type=issue-comment`
  .get("/:issue_id/history/", async ({params: {slug, project_id, issue_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const activityType = (query.activity_type as string) ?? "issue-property";
    const isComment = activityType.includes("comment");

    // issue-comment feed: the frontend's getIssueComments() hits this endpoint and
    // expects full comment objects (comment_html/comment_json/actor_detail…).
    if (isComment) {
      const commentWhere: any = {issueId: issue_id, deletedAt: null};
      if (query.created_at__gt) commentWhere.createdAt = {gt: new Date(query.created_at__gt as string)};
      const comments = await prisma.issueComment.findMany({
        where: commentWhere,
        orderBy: {createdAt: "asc"},
        include: COMMENT_INCLUDE,
        take: 200,
      });
      return comments.map(serializeComment);
    }

    // issue-property feed: property-change activities
    const activities = await prisma.issueActivity.findMany({
      where: {issueId: issue_id, deletedAt: null, issueCommentId: null},
      orderBy: {createdAt: "asc"},
      take: 100,
      include: {issue: {select: {sequenceId: true, projectId: true}}},
    });

    return activities.map((a: any) => ({
      id: a.id,
      issue: issue_id,
      project: a.projectId,
      workspace: a.workspaceId,
      actor: a.actorId ?? null,
      verb: a.verb,
      field: a.field ?? null,
      old_value: a.oldValue ?? null,
      new_value: a.newValue ?? null,
      comment: a.comment ?? "",
      epoch: a.epoch ?? null,
      issue_comment: a.issueCommentId ?? null,
      created_at: a.createdAt?.toISOString(),
      updated_at: a.updatedAt?.toISOString(),
      old_identifier: null,
      new_identifier: null,
      issue_detail: {id: issue_id, sequence_id: a.issue?.sequenceId ?? 0, name: ""},
    }));
  })

  // ── Sub-issues ────────────────────────────────────────────────────────────────
  .get("/:issue_id/sub-issues/", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const subIssues = await prisma.issue.findMany({
      where: {parentId: issue_id, deletedAt: null},
      include: ISSUE_INCLUDE,
      orderBy: {createdAt: "asc"},
    });
    return {
      count: subIssues.length,
      sub_issues: subIssues.map(serializeIssue),
      state_distribution: {},
    };
  })

  .post("/:issue_id/sub-issues/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const b = body as any;
    const subIssueIds: string[] = b.sub_issue_ids ?? [];
    if (subIssueIds.length) {
      await prisma.issue.updateMany({
        where: {id: {in: subIssueIds}, projectId: project_id, deletedAt: null},
        data: {parentId: issue_id},
      });
    }
    set.status = 201;
    return {sub_issue_ids: subIssueIds};
  })

  // ── Issue relations ─────────────────────────────────────────────────────────
  // The frontend expects a grouped object {blocking, blocked_by, duplicate,
  // relates_to} of full work items, and computes reverse relations from both
  // directions. We never persist the inverse — the GET derives it.
  .get("/:issue_id/issue-relation/", async ({params: {slug, project_id, issue_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const [direct, reverse] = await Promise.all([
      prisma.issueRelation.findMany({where: {issueId: issue_id, deletedAt: null}, include: {relatedIssue: {include: ISSUE_INCLUDE}}}),
      prisma.issueRelation.findMany({where: {relatedIssueId: issue_id, deletedAt: null}, include: {issue: {include: ISSUE_INCLUDE}}}),
    ]);

    const grouped: Record<string, any[]> = {blocking: [], blocked_by: [], duplicate: [], relates_to: []};
    for (const r of direct as any[]) {
      if (grouped[r.relationType] && r.relatedIssue) grouped[r.relationType].push(serializeIssue(r.relatedIssue));
    }
    for (const r of reverse as any[]) {
      const t = RELATION_REVERSE[r.relationType] ?? r.relationType;
      if (grouped[t] && r.issue) grouped[t].push(serializeIssue(r.issue));
    }
    return grouped;
  })

  .post("/:issue_id/issue-relation/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const b = body as any;
    const relationType: string = b.relation_type;
    const ids: string[] = b.issues ?? (b.related_issue ? [b.related_issue] : []);
    if (!relationType || !ids.length) {
      set.status = 400;
      return {detail: "relation_type e issues são obrigatórios."};
    }
    const created: any[] = [];
    for (const rid of ids) {
      if (rid === issue_id) continue;
      const exists = await prisma.issueRelation.findFirst({
        where: {issueId: issue_id, relatedIssueId: rid, relationType, deletedAt: null},
        select: {id: true},
      });
      if (!exists) {
        await prisma.issueRelation.create({
          data: {issueId: issue_id, relatedIssueId: rid, workspaceId: ws.id, projectId: project_id, relationType},
        });
      }
      const ri = await prisma.issue.findFirst({where: {id: rid, deletedAt: null}, include: ISSUE_INCLUDE});
      if (ri) created.push(serializeIssue(ri));
    }
    set.status = 201;
    return created;
  })

  // Remove a relation by (relation_type, related_issue) — also clears any inverse.
  .post("/:issue_id/remove-relation/", async ({params: {slug, project_id, issue_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const b = body as any;
    const relationType: string = b.relation_type;
    const related: string = b.related_issue;
    if (!relationType || !related) {
      set.status = 400;
      return {detail: "relation_type e related_issue são obrigatórios."};
    }
    const rev = RELATION_REVERSE[relationType] ?? relationType;
    await prisma.issueRelation.updateMany({
      where: {issueId: issue_id, relatedIssueId: related, relationType, deletedAt: null},
      data: {deletedAt: new Date()},
    });
    await prisma.issueRelation.updateMany({
      where: {issueId: related, relatedIssueId: issue_id, relationType: rev, deletedAt: null},
      data: {deletedAt: new Date()},
    });
    set.status = 204;
    return null;
  })

  .delete("/:issue_id/issue-relation/:relation_id/", async ({params: {slug, project_id, relation_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.ISSUE_EDIT_ALL);
    const relation = await prisma.issueRelation.findFirst({
      where: {id: relation_id, projectId: project_id, workspaceId: ws.id, deletedAt: null},
    });
    if (!relation) {
      set.status = 404;
      return {detail: "Relação não encontrada."};
    }
    await prisma.issueRelation.update({where: {id: relation_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  });

/**
 * Listagem de chamados arquivados.
 *
 * Prefixo próprio porque a rota é `/projects/:id/archived-issues/`, fora do
 * `/issues` do módulo acima. Sem ela a tela "Arquivados" quebrava com NOT_FOUND.
 */
export const archivedIssuesModule = new Elysia({prefix: "/workspaces/:slug/projects/:project_id/archived-issues"})
  .use(authPlugin)

  .get("/", async ({params: {slug, project_id}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);

    const where: any = {projectId: project_id, deletedAt: null, isDraft: false, archivedAt: {not: null}};
    const filters = normalizeFilters(query as Record<string, unknown>);
    await applyIssueFilters(where, filters, {projectId: project_id});

    return paginate({
      query: (skip, take) =>
        prisma.issue.findMany({where, skip, take, include: ISSUE_INCLUDE, orderBy: {archivedAt: "desc"}}),
      count: () => prisma.issue.count({where}),
      cursor: query.cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  });
