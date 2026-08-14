/**
 * Resumo da página inicial.
 *
 * A home precisa de uma dezena de contagens (minhas, do setor, prazos, fila de
 * triagem). Buscar cada uma num endpoint diferente faria a tela abrir com dez
 * requisições e piscar número por número — aqui elas saem numa consulta só.
 *
 * Tudo é contado dentro dos projetos de que o usuário participa: a home é a
 * visão pessoal do dia, não um painel do espaço de trabalho inteiro.
 */
import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";
import { inicioDeHoje } from "@utils/prazo";
import { vencimento } from "@utils/serialize";

/** Grupos que representam trabalho ainda aberto. */
const GRUPOS_ABERTOS = ["backlog", "unstarted", "started", "triage"];

export const homeModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  .get("/home-summary/", async ({ params: { slug }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const meusProjetos = await prisma.projectMember.findMany({
      where: { workspaceId: ws.id, memberId: user.id, isActive: true, deletedAt: null },
      select: { projectId: true },
    });
    const projectIds = meusProjetos.map((p) => p.projectId);

    // Sem projeto não há o que contar — devolver zeros evita que a tela mostre
    // "carregando" para sempre em conta recém-criada.
    if (projectIds.length === 0) {
      return {
        meus_abertos: 0,
        meus_atrasados: 0,
        meus_vencem_hoje: 0,
        abertos_por_mim: 0,
        em_triagem: 0,
        solicitacoes_pendentes: 0,
        concluidos_7d: 0,
        criados_7d: 0,
        por_prioridade: [],
        por_etapa: [],
        projetos: 0,
      };
    }

    // `agora` é o corte de atraso: com prazo em horas, um chamado que vencia
    // às 14h já está atrasado às 15h, ainda que o dia não tenha virado.
    const agora = new Date();
    const amanha = inicioDeHoje(1);
    const seteDiasAtras = inicioDeHoje(-7);

    const base = { workspaceId: ws.id, projectId: { in: projectIds }, deletedAt: null, isDraft: false } as const;
    const meus = { ...base, assignees: { some: { assigneeId: user.id, deletedAt: null } } };
    const abertos = { state: { group: { in: GRUPOS_ABERTOS } } };

    const [
      meus_abertos,
      meus_atrasados,
      meus_vencem_hoje,
      abertos_por_mim,
      em_triagem,
      solicitacoes_pendentes,
      concluidos_7d,
      criados_7d,
      prioridades,
      etapas,
    ] = await Promise.all([
      prisma.issue.count({ where: { ...meus, ...abertos } }),
      prisma.issue.count({ where: { ...meus, ...abertos, targetDate: { lt: agora } } }),
      // "Vence hoje" é o que AINDA vai vencer hoje. O que já passou da hora
      // conta como atrasado — os dois números não podem somar o mesmo chamado.
      prisma.issue.count({ where: { ...meus, ...abertos, targetDate: { gte: agora, lt: amanha } } }),
      prisma.issue.count({ where: { ...base, ...abertos, createdById: user.id } }),
      prisma.issue.count({ where: { ...base, state: { group: "triage" } } }),
      // Convenção do intake: -2 pendente, -1 recusado, 0 adiado, 1 aceito, 2 duplicado.
      prisma.intakeIssue.count({
        where: { workspaceId: ws.id, projectId: { in: projectIds }, deletedAt: null, status: { in: [-2, 0] } },
      }),
      prisma.issue.count({ where: { ...base, state: { group: "completed" }, completedAt: { gte: seteDiasAtras } } }),
      prisma.issue.count({ where: { ...base, createdAt: { gte: seteDiasAtras } } }),
      prisma.issue.groupBy({ by: ["priority"], where: { ...meus, ...abertos }, _count: { id: true } }),
      prisma.issue.groupBy({ by: ["stateId"], where: { ...meus, ...abertos }, _count: { id: true } }),
    ]);

    // Os estados repetem por projeto; a home mostra por NOME, somando.
    const estados = await prisma.state.findMany({
      where: { id: { in: etapas.map((e) => e.stateId!).filter(Boolean) } },
      select: { id: true, name: true, color: true, group: true },
    });
    const porNome = new Map<string, { name: string; color: string; group: string; count: number }>();
    for (const linha of etapas) {
      const estado = estados.find((e) => e.id === linha.stateId);
      if (!estado) continue;
      const atual = porNome.get(estado.name) ?? { name: estado.name, color: estado.color, group: estado.group, count: 0 };
      atual.count += linha._count.id;
      porNome.set(estado.name, atual);
    }

    return {
      meus_abertos,
      meus_atrasados,
      meus_vencem_hoje,
      abertos_por_mim,
      em_triagem,
      solicitacoes_pendentes,
      concluidos_7d,
      criados_7d,
      por_prioridade: prioridades
        .map((p) => ({ priority: p.priority, count: p._count.id }))
        .sort((a, b) => b.count - a.count),
      por_etapa: [...porNome.values()].sort((a, b) => b.count - a.count),
      projetos: projectIds.length,
    };
  })

  /** Chamados meus que já passaram do prazo — a lista que a home destaca. */
  .get("/home-overdue/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const limite = Math.min(Number(query.limit ?? 6) || 6, 20);
    const chamados = await prisma.issue.findMany({
      where: {
        workspaceId: ws.id,
        deletedAt: null,
        isDraft: false,
        assignees: { some: { assigneeId: user.id, deletedAt: null } },
        state: { group: { in: GRUPOS_ABERTOS } },
        targetDate: { lt: new Date() },
      },
      orderBy: { targetDate: "asc" },
      take: limite,
      select: {
        id: true,
        name: true,
        priority: true,
        targetDate: true,
        sequenceId: true,
        project: { select: { id: true, identifier: true, name: true } },
        state: { select: { name: true, color: true, group: true } },
      },
    });

    return chamados.map((c) => ({
      id: c.id,
      name: c.name,
      priority: c.priority,
      target_date: vencimento(c.targetDate),
      sequence_id: c.sequenceId,
      project_id: c.project.id,
      project_identifier: c.project.identifier,
      project_name: c.project.name,
      state_name: c.state?.name ?? null,
      state_color: c.state?.color ?? null,
      state_group: c.state?.group ?? null,
    }));
  });
