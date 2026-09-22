/**
 * DAO das ligações: só acesso a dados. Toda regra (quem pode, em que situação a
 * ligação entra, o que é obrigatório) vive em `ligacoes.service.ts`.
 *
 * `workspaceId` do chat é o SLUG do espaço; as tabelas do api-ts (`projects`,
 * `issues`, `entity_contacts`) são lidas por SQL, como no resto do chat.
 */

import prisma from "@db";
import { PHONE_CHANNEL } from "@/canais";
import type { Ramal } from "@/ligacoes/payload";

const WITH_LIGACAO = { ligacao: true, contact: true } as const;

export type SessaoComLigacao = NonNullable<Awaited<ReturnType<typeof findSessaoComLigacao>>>;

export const findSessaoComLigacao = (slug: string, sessionId: string) =>
  prisma.chatSession.findFirst({ where: { id: sessionId, workspaceId: slug }, include: WITH_LIGACAO });

export const findLigacaoByCallId = (slug: string, callId: string) =>
  prisma.chatLigacao.findUnique({ where: { workspaceId_callId: { workspaceId: slug, callId } } });

type NovaSessao = Parameters<typeof prisma.chatSession.create>[0]["data"];
type NovaLigacao = Omit<Parameters<typeof prisma.chatLigacao.create>[0]["data"], "session" | "sessionId">;

/** Sessão e ligação nascem juntas: se o call_id já existe, nenhuma das duas fica. */
export const createSessaoComLigacao = (sessao: NovaSessao, ligacao: NovaLigacao) =>
  prisma.$transaction(async (tx) => {
    const criada = await tx.chatSession.create({ data: sessao });
    await tx.chatLigacao.create({ data: { ...ligacao, sessionId: criada.id } });
    return criada.id;
  });

export const updateLigacao = (id: string, data: Parameters<typeof prisma.chatLigacao.update>[0]["data"]) =>
  prisma.chatLigacao.update({ where: { id }, data });

export const updateSessao = (id: string, data: Parameters<typeof prisma.chatSession.update>[0]["data"]) =>
  prisma.chatSession.update({ where: { id }, data });

// ── Configuração ──────────────────────────────────────────────────────────────

export const findTelefoniaConfig = (slug: string) =>
  prisma.chatTelefoniaConfig.findUnique({ where: { workspaceId: slug } });

export const saveTokenHash = (slug: string, tokenHash: string | null, tokenLast4: string | null, userId: string) =>
  prisma.chatTelefoniaConfig.upsert({
    where: { workspaceId: slug },
    create: { workspaceId: slug, tokenHash, tokenLast4, updatedById: userId },
    update: { tokenHash, tokenLast4, updatedById: userId },
  });

export const listRamais = (slug: string) =>
  prisma.chatRamal.findMany({ where: { workspaceId: slug }, orderBy: { extension: "asc" } });

/** A lista é SUBSTITUÍDA por inteiro: é assim que a tela salva. */
export const replaceRamais = (slug: string, ramais: Ramal[]) =>
  prisma.$transaction([
    prisma.chatRamal.deleteMany({ where: { workspaceId: slug } }),
    prisma.chatRamal.createMany({
      data: ramais.map((r) => ({ workspaceId: slug, extension: r.extension, userId: r.userId })),
    }),
  ]);

export const findRamal = (slug: string, extension: string) =>
  prisma.chatRamal.findUnique({ where: { workspaceId_extension: { workspaceId: slug, extension } } });

// ── Tabelas do api-ts ─────────────────────────────────────────────────────────

export type ProjetoDoEspaco = { id: string; identifier: string; name: string };

export async function findProjetoDoEspaco(slug: string, projectId: string): Promise<ProjetoDoEspaco | null> {
  const linhas = (await prisma.$queryRaw`
    SELECT p.id::text AS id, p.identifier, p.name
      FROM projects p JOIN workspaces w ON w.id = p.workspace_id
     WHERE w.slug = ${slug} AND p.deleted_at IS NULL AND p.id::text = ${projectId}
     LIMIT 1`) as ProjetoDoEspaco[];
  return linhas[0] ?? null;
}

export type ChamadoDoEspaco = { id: string; projectId: string; label: string };

/** O número exibido do chamado é `IDENTIFICADOR-sequencial`, como no Plane. */
export async function findChamadoDoEspaco(slug: string, issueId: string): Promise<ChamadoDoEspaco | null> {
  const linhas = (await prisma.$queryRaw`
    SELECT i.id::text AS id, i.project_id::text AS "projectId", p.identifier || '-' || i.sequence_id AS label
      FROM issues i
      JOIN projects p ON p.id = i.project_id
      JOIN workspaces w ON w.id = i.workspace_id
     WHERE w.slug = ${slug} AND i.deleted_at IS NULL AND i.id::text = ${issueId}
     LIMIT 1`) as ChamadoDoEspaco[];
  return linhas[0] ?? null;
}

export type EntidadeDoResponsavel = { contactId: string; entityId: string | null; entityName: string | null };

export async function findEntidadesDosResponsaveis(contactIds: string[]): Promise<EntidadeDoResponsavel[]> {
  if (!contactIds.length) return [];
  return (await prisma.$queryRaw`
    SELECT ec.id::text AS "contactId", ec.entity_id::text AS "entityId", e.name AS "entityName"
      FROM entity_contacts ec
      LEFT JOIN entities e ON e.id = ec.entity_id
     WHERE ec.id::text = ANY(${contactIds}::text[])`) as EntidadeDoResponsavel[];
}

// ── Histórico e relatório ─────────────────────────────────────────────────────

const HISTORICO_LIMITE = 50;

/** Conversas e ligações da mesma pessoa: pelo cadastro ou por qualquer forma do telefone. */
export const findHistoricoDoCliente = (slug: string, filtro: { entityContactId: string | null; phones: string[] }) =>
  prisma.chatSession.findMany({
    where: {
      workspaceId: slug,
      OR: [
        ...(filtro.entityContactId ? [{ entityContactId: filtro.entityContactId }] : []),
        ...(filtro.phones.length ? [{ clientPhone: { in: filtro.phones } }] : []),
      ],
    },
    include: WITH_LIGACAO,
    orderBy: { createdAt: "desc" },
    take: HISTORICO_LIMITE,
  });

export const findLigacoesDoPeriodo = (slug: string, since: Date) =>
  prisma.chatSession.findMany({
    where: { workspaceId: slug, channel: PHONE_CHANNEL, createdAt: { gte: since } },
    select: {
      assignedAttendantId: true,
      entityContactId: true,
      projectId: true,
      projectName: true,
      ligacao: { select: { status: true, concludedAt: true } },
    },
  });
