/**
 * DAO do disparo em massa: só acesso a dados. Toda regra (quem recebe, ritmo,
 * o que é obrigatório) vive em `regras.ts` e `service.ts`.
 *
 * `workspaceId` do chat é o SLUG do espaço; `entity_contacts`, `entities` e
 * `entity_contact_projects` são do api-ts e são lidas por SQL.
 */

import prisma from "@db";
import {
  DISPARO_EXECUCAO_STATUS,
  DISPARO_ITEM_STATUS,
  type ContatoDoDisparo,
  type Destinatario,
  type FiltrosDoDisparo,
} from "@/disparo/regras";

type Prisma = typeof prisma;
type NovaMensagem = Parameters<Prisma["chatDisparoMensagem"]["create"]>[0]["data"];
type MudancaDaMensagem = Parameters<Prisma["chatDisparoMensagem"]["update"]>[0]["data"];
type NovaExecucao = Omit<Parameters<Prisma["chatDisparoExecucao"]["create"]>[0]["data"], "mensagem" | "itens">;

const EM_ABERTO = [DISPARO_ITEM_STATUS.PENDENTE, DISPARO_ITEM_STATUS.PROCESSANDO];

// ── Mensagens ─────────────────────────────────────────────────────────────────

const WITH_ULTIMO_ENVIO = {
  execucoes: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, total: true, status: true } },
} as const;

export const listMensagens = (slug: string) =>
  prisma.chatDisparoMensagem.findMany({
    where: { workspaceId: slug, deletedAt: null },
    include: WITH_ULTIMO_ENVIO,
    orderBy: { createdAt: "desc" },
  });

export type MensagemWithUltimoEnvio = Awaited<ReturnType<typeof listMensagens>>[number];

export const findMensagem = (slug: string, id: string) =>
  prisma.chatDisparoMensagem.findFirst({
    where: { id, workspaceId: slug, deletedAt: null },
    include: WITH_ULTIMO_ENVIO,
  });

export const createMensagem = (data: NovaMensagem) =>
  prisma.chatDisparoMensagem.create({ data, include: WITH_ULTIMO_ENVIO });

export const updateMensagem = (id: string, data: MudancaDaMensagem) =>
  prisma.chatDisparoMensagem.update({ where: { id }, data, include: WITH_ULTIMO_ENVIO });

// ── Destinatários (tabelas do api-ts) ────────────────────────────────────────

/**
 * Responsáveis ativos que aceitam mensagem, de entidade ativa do espaço. Mesmo
 * corte do SAC (`ativo = 1 AND enviar_mensagem = 1`, JOIN com a entidade).
 */
export async function findContatos(slug: string, filtros: FiltrosDoDisparo): Promise<ContatoDoDisparo[]> {
  return (await prisma.$queryRaw`
    SELECT ec.id::text AS "contactId",
           ec.name AS name,
           e.name AS "entityName",
           COALESCE(NULLIF(ec.phone_digits, ''), ec.phone) AS phone
      FROM entity_contacts ec
      JOIN entities e ON e.id = ec.entity_id
      JOIN workspaces w ON w.id = ec.workspace_id
     WHERE w.slug = ${slug}
       AND ec.deleted_at IS NULL AND ec.is_active = true AND ec.receive_messages = true
       AND e.deleted_at IS NULL AND e.is_active = true
       AND (${filtros.entityType}::int IS NULL OR e.entity_type = ${filtros.entityType}::int)
       AND (${filtros.entityId}::text IS NULL OR e.id::text = ${filtros.entityId}::text)
       AND (${filtros.projectId}::text IS NULL OR EXISTS (
             SELECT 1 FROM entity_contact_projects ecp
              WHERE ecp.contact_id = ec.id AND ecp.project_id::text = ${filtros.projectId}::text))
     ORDER BY ec.created_at ASC, ec.id ASC`) as ContatoDoDisparo[];
}

// ── Execuções e itens ─────────────────────────────────────────────────────────

export const hasExecucaoEmAndamento = async (mensagemId: string): Promise<boolean> =>
  (await prisma.chatDisparoExecucao.count({
    where: { mensagemId, status: DISPARO_EXECUCAO_STATUS.EM_ANDAMENTO },
  })) > 0;

/** Execução e itens nascem juntos: nada de execução sem fila. */
export const createExecucaoWithItens = (mensagemId: string, execucao: NovaExecucao, destinatarios: Destinatario[]) =>
  prisma.$transaction(async (tx) => {
    const criada = await tx.chatDisparoExecucao.create({ data: { ...execucao, mensagemId } });
    await tx.chatDisparoItem.createMany({
      data: destinatarios.map((d) => ({
        execucaoId: criada.id,
        workspaceId: execucao.workspaceId,
        telefone: d.telefone,
        contactId: d.contactId,
        contactName: d.name,
        entityName: d.entityName,
      })),
    });
    return criada;
  });

export const listExecucoes = (slug: string, mensagemId: string | null, take: number) =>
  prisma.chatDisparoExecucao.findMany({
    where: { workspaceId: slug, ...(mensagemId ? { mensagemId } : {}) },
    orderBy: { createdAt: "desc" },
    take,
  });

export type Execucao = Awaited<ReturnType<typeof listExecucoes>>[number];

export const findExecucao = (slug: string, id: string) =>
  prisma.chatDisparoExecucao.findFirst({ where: { id, workspaceId: slug } });

export const listItens = (execucaoId: string, status: string | null) =>
  prisma.chatDisparoItem.findMany({
    where: { execucaoId, ...(status ? { status } : {}) },
    orderBy: [{ tentadoEm: { sort: "asc", nulls: "last" } }, { contactName: "asc" }],
  });

export type Item = Awaited<ReturnType<typeof listItens>>[number];

/** Contagem por execução e situação, numa consulta só (sem `_count` por linha). */
export async function countItensPorStatus(execucaoIds: string[]) {
  if (!execucaoIds.length) return [];
  const linhas = await prisma.chatDisparoItem.groupBy({
    by: ["execucaoId", "status"],
    where: { execucaoId: { in: execucaoIds } },
    _count: { _all: true },
  });
  return linhas.map((l) => ({ execucaoId: l.execucaoId, status: l.status, total: l._count._all }));
}

export const cancelExecucao = (id: string, agora: Date) =>
  prisma.$transaction([
    prisma.chatDisparoItem.updateMany({
      where: { execucaoId: id, status: DISPARO_ITEM_STATUS.PENDENTE },
      data: { status: DISPARO_ITEM_STATUS.CANCELADO },
    }),
    prisma.chatDisparoExecucao.update({
      where: { id },
      data: { status: DISPARO_EXECUCAO_STATUS.CANCELADA, finishedAt: agora },
    }),
  ]);

// ── Fila (worker) ─────────────────────────────────────────────────────────────

export const listWorkspacesWithEnvioAberto = async (): Promise<string[]> =>
  (
    await prisma.chatDisparoExecucao.findMany({
      where: { status: DISPARO_EXECUCAO_STATUS.EM_ANDAMENTO },
      distinct: ["workspaceId"],
      select: { workspaceId: true },
    })
  ).map((e) => e.workspaceId);

/** Instante da última tentativa do espaço: é dele que o ritmo conta. */
export const findUltimaTentativa = async (slug: string): Promise<Date | null> =>
  (
    await prisma.chatDisparoItem.aggregate({
      where: { workspaceId: slug, tentadoEm: { not: null } },
      _max: { tentadoEm: true },
    })
  )._max.tentadoEm;

/**
 * Pega o próximo item pendente e já o marca `processando`, numa instrução só:
 * `SKIP LOCKED` impede que duas passadas peguem o mesmo telefone.
 */
export async function claimProximoItem(slug: string, agora: Date): Promise<string | null> {
  const linhas = (await prisma.$queryRaw`
    UPDATE chat_disparo_itens SET status = ${DISPARO_ITEM_STATUS.PROCESSANDO}, tentado_em = ${agora}
     WHERE id = (
       SELECT i.id FROM chat_disparo_itens i
         JOIN chat_disparo_execucoes e ON e.id = i.execucao_id
        WHERE i.workspace_id = ${slug} AND i.status = ${DISPARO_ITEM_STATUS.PENDENTE}
          AND e.status = ${DISPARO_EXECUCAO_STATUS.EM_ANDAMENTO}
        ORDER BY e.created_at ASC, i.created_at ASC, i.id ASC
        LIMIT 1
        FOR UPDATE OF i SKIP LOCKED)
    RETURNING id::text AS id`) as Array<{ id: string }>;
  return linhas[0]?.id ?? null;
}

export const findItemWithExecucao = (id: string) =>
  prisma.chatDisparoItem.findUniqueOrThrow({ where: { id }, include: { execucao: true } });

export type ItemWithExecucao = Awaited<ReturnType<typeof findItemWithExecucao>>;

export const markItem = (id: string, data: { status: string; erro?: string | null; externalId?: string | null }) =>
  prisma.chatDisparoItem.update({ where: { id }, data });

/** Execução sem nada pendente nem em envio está concluída. */
export const finishExecucoesWithoutPendencia = (slug: string, agora: Date) =>
  prisma.chatDisparoExecucao.updateMany({
    where: {
      workspaceId: slug,
      status: DISPARO_EXECUCAO_STATUS.EM_ANDAMENTO,
      itens: { none: { status: { in: EM_ABERTO } } },
    },
    data: { status: DISPARO_EXECUCAO_STATUS.CONCLUIDA, finishedAt: agora },
  });

export const failItensProcessando = (erro: string) =>
  prisma.chatDisparoItem.updateMany({
    where: { status: DISPARO_ITEM_STATUS.PROCESSANDO },
    data: { status: DISPARO_ITEM_STATUS.FALHOU, erro },
  });

// ── Configuração ──────────────────────────────────────────────────────────────

export const findConfig = (slug: string) => prisma.chatDisparoConfig.findUnique({ where: { workspaceId: slug } });

export const saveConfig = (slug: string, mensagensPorMinuto: number, userId: string) =>
  prisma.chatDisparoConfig.upsert({
    where: { workspaceId: slug },
    create: { workspaceId: slug, mensagensPorMinuto, updatedById: userId },
    update: { mensagensPorMinuto, updatedById: userId },
  });
