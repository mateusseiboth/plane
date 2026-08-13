/**
 * work-items = alias for issues
 * The frontend uses EIssueServiceType.WORK_ITEMS = "work-items" as the service type
 * for description-versions and other endpoints. This module re-exports the issue handlers
 * under the /work-items/ prefix.
 */
import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { getWorkspaceOrFail, getProjectOrFail } from "@utils/workspace";
import { serializeIssue, ISSUE_INCLUDE } from "@utils/serialize";
import { paginate } from "@utils/pagination";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { serializarVersao } from "@utils/versoes-da-descricao";

/**
 * Quebra "ESIC-150" em {identificadorDoProjeto: "ESIC", sequencia: 150}.
 *
 * A divisão é feita no ÚLTIMO hífen porque o identificador do projeto pode
 * conter hífen ("SIART-WEB-150"); só o sufixo numérico é a sequência.
 * Devolve null quando não há sufixo numérico — aí o pedido é inválido, não 404.
 */
function separarIdentificador(bruto: string): { identificadorDoProjeto: string; sequencia: number } | null {
  const partes = /^(.+)-(\d{1,10})$/.exec(decodeURIComponent(bruto).trim());
  if (!partes) return null;
  return { identificadorDoProjeto: partes[1], sequencia: Number(partes[2]) };
}

export const workItemModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/work-items" })
  .use(authPlugin)

  // ── Alias: proxy GET to issues ─────────────────────────────────────────────
  .get("/", async ({ params: { slug, project_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where: any = { projectId: project_id, deletedAt: null, isDraft: false };
    const orderBy: any = { updatedAt: "desc" };
    return paginate({
      query: (skip, take) => prisma.issue.findMany({ where, skip, take, include: ISSUE_INCLUDE, orderBy }),
      count: () => prisma.issue.count({ where }),
      cursor: (query as any).cursor as string | undefined,
      transform: (items) => items.map(serializeIssue),
    });
  })

  // ── Description versions ──────────────────────────────────────────────────
  // Envelope paginado, igual ao módulo de chamados: o seletor lê `results`.
  .get("/:issue_id/description-versions/", async ({ params: { slug, project_id, issue_id }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const where = { issueId: issue_id };
    return paginate({
      query: (skip, take) => prisma.issueVersion.findMany({ where, orderBy: { lastSavedAt: "desc" }, skip, take }),
      count: () => prisma.issueVersion.count({ where }),
      cursor: (query as any).cursor as string | undefined,
      transform: (versions) =>
        versions.map((v: any) => serializarVersao(v, { issueId: issue_id, workspaceId: ws.id, projectId: project_id })),
    });
  })

  .get("/:issue_id/description-versions/:version_id/", async ({ params: { slug, project_id, issue_id, version_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const v = await prisma.issueVersion.findFirst({ where: { id: version_id, issueId: issue_id } });
    if (!v) { set.status = 404; return { detail: "Não encontrado." }; }
    return serializarVersao(v, { issueId: issue_id, workspaceId: ws.id, projectId: project_id });
  });

/**
 * Resolve o identificador legível ("ESIC-150") para o chamado.
 *
 * É o endpoint por trás da rota /:espaco/browse/:identificador/ do frontend, que
 * é o link que vai nas notificações e nos e-mails. Sem ele, todo link de
 * notificação cai na tela de "chamado não existe".
 *
 * Equivalente ao IssueDetailIdentifierEndpoint do Django legado:
 * workspaces/<slug>/work-items/<project_identifier>-<issue_identifier>/
 */
export const workItemPorIdentificadorModule = new Elysia({ prefix: "/workspaces/:slug/work-items" })
  .use(authPlugin)

  .get("/:identificador/", async ({ params: { slug, identificador }, user, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);

    const partes = separarIdentificador(identificador);
    if (!partes) {
      set.status = 400;
      return { detail: "Identificador de chamado inválido." };
    }

    // O identificador do projeto é digitado/colado em qualquer caixa ("esic-150"),
    // então a comparação ignora maiúsculas — como no Django (identifier__iexact).
    const projeto = await prisma.project.findFirst({
      where: {
        workspaceId: ws.id,
        deletedAt: null,
        identifier: { equals: partes.identificadorDoProjeto, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!projeto) {
      set.status = 404;
      return { detail: "Chamado não encontrado." };
    }

    // Confere a permissão só depois de saber que o projeto existe: quem não é
    // membro recebe 403 (getProjectOrFail), e não um 404 que esconde o motivo.
    await getProjectOrFail(ws.id, projeto.id, user.id);

    const chamado = await prisma.issue.findFirst({
      where: { projectId: projeto.id, sequenceId: partes.sequencia, deletedAt: null },
      include: ISSUE_INCLUDE,
    });
    if (!chamado) {
      set.status = 404;
      return { detail: "Chamado não encontrado." };
    }

    // LGPD: abrir um chamado é tratamento de dado — registra quem viu e de onde,
    // igual ao GET por id em modules/issue.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ISSUE,
      entityId: chamado.id,
      action: AUDIT_ACTIONS.VIEW,
      actor: user,
      headers,
      metadata: { project_id: projeto.id, sequence_id: chamado.sequenceId },
    });

    // Solicitações em triagem são redirecionadas pelo frontend para a tela de
    // entrada, então a flag precisa vir preenchida (o serializer padrão fixa false).
    return { ...serializeIssue(chamado), is_intake: (chamado as any).state?.group === "triage" };
  });
