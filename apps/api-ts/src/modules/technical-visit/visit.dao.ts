/**
 * DAO da visita técnica: só acesso a dados. Regra (quem pode, trava de
 * encerramento, número) vive em `visit.service.ts` e nos módulos puros ao lado.
 */
import prisma from "@db";
import { Prisma } from "@prisma/client";
import { findMaiorSequencial, formatVisitNumber, getAnoDaVisita } from "@modules/technical-visit/visit-number";

type Tx = Prisma.TransactionClient;

const SELECT_TECNICO = { id: true, displayName: true, firstName: true, lastName: true } as const;

// Include de toda leitura de visita: `contact_records`, técnicos e chamados
// vinculados fazem parte do contrato e somem da resposta se a consulta não os traz.
export const INCLUDE_VISITA = {
  entity: { select: { id: true, name: true, city: true } },
  technician: { select: SELECT_TECNICO },
  technician2: { select: SELECT_TECNICO },
  contactRecords: {
    include: {
      contact: {
        include: {
          entity: { select: { id: true, name: true } },
          type: { select: { id: true, name: true, isSystemUser: true } },
        },
      },
    },
  },
  visitIssues: {
    where: { deletedAt: null, issue: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    include: {
      issue: {
        select: {
          id: true,
          name: true,
          sequenceId: true,
          projectId: true,
          project: { select: { identifier: true } },
          state: { select: { name: true, group: true } },
        },
      },
    },
  },
} as const;

/** Anexos da visita: os enviados pela tela e os que o importador trouxe do SAC. */
const whereAnexosDaVisita = (visitId: string) => ({
  entityId: visitId,
  isDeleted: false,
  deletedAt: null,
  attributes: { path: ["category"], equals: "visita" },
});

export const findVisita = (workspaceId: string, visitId: string) =>
  prisma.technicalVisit.findFirst({ where: { id: visitId, workspaceId, deletedAt: null }, include: INCLUDE_VISITA });

export const listVisitas = (where: object, skip: number, take: number) =>
  prisma.technicalVisit.findMany({
    where,
    skip,
    take,
    include: INCLUDE_VISITA,
    orderBy: [{ scheduledDate: "desc" }, { createdAt: "desc" }],
  });

export const countVisitas = (where: object) => prisma.technicalVisit.count({ where });

export const findVisitaNaTransacao = (tx: Tx, visitId: string) =>
  tx.technicalVisit.findUniqueOrThrow({ where: { id: visitId }, include: INCLUDE_VISITA });

/** Sistemas, funcionalidades e anexos: só o detalhe precisa, a lista não. */
export async function findDetalhesDaVisita(visita: { id: string; projectIds: unknown; moduleIds: unknown }) {
  const projectIds = readIds(visita.projectIds);
  const moduleIds = readIds(visita.moduleIds);
  const [projects, modules, anexos] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds }, deletedAt: null },
      select: { id: true, name: true, identifier: true },
      orderBy: { name: "asc" },
    }),
    prisma.module.findMany({
      where: { id: { in: moduleIds }, deletedAt: null },
      select: { id: true, name: true, projectId: true },
      orderBy: { name: "asc" },
    }),
    prisma.fileAsset.findMany({ where: whereAnexosDaVisita(visita.id), orderBy: { createdAt: "asc" } }),
  ]);
  return { projects, modules, anexos };
}

export const readIds = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((id): id is string => typeof id === "string") : [];

// ── Referências usadas na validação ────────────────────────────────────────────

export const findMembrosAtivos = async (workspaceId: string, userIds: string[]) => {
  const membros = await prisma.workspaceMember.findMany({
    where: { workspaceId, memberId: { in: userIds }, isActive: true, deletedAt: null },
    select: { memberId: true },
  });
  return new Set(membros.map((m) => m.memberId));
};

export const findEntidade = (workspaceId: string, entityId: string) =>
  prisma.entity.findFirst({ where: { id: entityId, workspaceId, deletedAt: null }, select: { id: true, city: true } });

export const findChamadosDoEspaco = (workspaceId: string, issueIds: string[]) =>
  prisma.issue.findMany({
    where: { id: { in: issueIds }, workspaceId, deletedAt: null },
    select: { id: true, projectId: true, entityId: true },
    orderBy: { createdAt: "asc" },
  });

export const findProjetosDoEspaco = async (workspaceId: string, projectIds: string[]) => {
  const projetos = await prisma.project.findMany({
    where: { id: { in: projectIds }, workspaceId, deletedAt: null },
    select: { id: true },
  });
  return new Set(projetos.map((p) => p.id));
};

export const findModulosDoEspaco = (workspaceId: string, moduleIds: string[]) =>
  prisma.module.findMany({
    where: { id: { in: moduleIds }, workspaceId, deletedAt: null },
    select: { id: true, projectId: true },
  });

// ── Número N-AAAA ──────────────────────────────────────────────────────────────

const findMaiorNumeroGravado = async (tx: Tx, workspaceId: string, ano: number) => {
  const visitas = await tx.technicalVisit.findMany({
    where: { workspaceId, visitNumber: { endsWith: `-${ano}` } },
    select: { visitNumber: true },
  });
  return findMaiorSequencial(
    visitas.map((v: { visitNumber: string | null }) => v.visitNumber),
    ano
  );
};

/**
 * Próximo número do ano no espaço. O contador nasce do maior número já gravado
 * (inclusive os do SAC) e depois só incrementa.
 *
 * `INSERT ... ON CONFLICT DO UPDATE` escrito à mão de propósito: o `upsert` do
 * Prisma só vira ON CONFLICT em alguns formatos de chave e, fora deles, lê e
 * depois grava. Duas visitas criadas no mesmo instante levariam o mesmo número
 * (ou um erro de chave duplicada). Aqui a segunda espera a primeira e incrementa.
 */
export async function nextVisitNumber(tx: Tx, workspaceId: string, agora: Date): Promise<string> {
  const ano = getAnoDaVisita(agora);
  const inicial = (await findMaiorNumeroGravado(tx, workspaceId, ano)) + 1;
  const [contador] = await tx.$queryRaw<{ last_number: number }[]>(Prisma.sql`
    INSERT INTO technical_visit_counters (workspace_id, year, last_number, updated_at)
    VALUES (${workspaceId}::uuid, ${ano}, ${inicial}, now())
    ON CONFLICT (workspace_id, year)
    DO UPDATE SET last_number = technical_visit_counters.last_number + 1, updated_at = now()
    RETURNING last_number`);
  return formatVisitNumber(Number(contador!.last_number), ano);
}

// ── Chamados vinculados ────────────────────────────────────────────────────────

export const findVinculo = (visitId: string, issueId: string) =>
  prisma.technicalVisitIssue.findFirst({ where: { visitId, issueId, deletedAt: null } });

export const createVinculos = (tx: Tx, visitId: string, issueIds: string[]) =>
  tx.technicalVisitIssue.createMany({ data: issueIds.map((issueId) => ({ visitId, issueId })) });

export const removeVinculo = (vinculoId: string) =>
  prisma.technicalVisitIssue.update({ where: { id: vinculoId }, data: { deletedAt: new Date() } });

// ── Anexos ─────────────────────────────────────────────────────────────────────

export const findAnexo = (visitId: string, anexoId: string) =>
  prisma.fileAsset.findFirst({ where: { id: anexoId, ...whereAnexosDaVisita(visitId) } });

export const createAnexo = (dados: {
  id: string;
  workspaceId: string;
  visitId: string;
  asset: string;
  nome: string;
  tipo: string;
  tamanho: number;
  enviadoPor: string;
}) =>
  prisma.fileAsset.create({
    data: {
      id: dados.id,
      workspaceId: dados.workspaceId,
      // Mesma forma que o importador do SAC grava (`migrate-sac-files.ts`): entidade
      // "espaço", `entityId` = visita e `category: "visita"`. As duas origens aparecem juntas.
      entityType: 0,
      entityId: dados.visitId,
      asset: dados.asset,
      size: dados.tamanho,
      mimeType: dados.tipo,
      isUploaded: true,
      attributes: {
        name: dados.nome,
        type: dados.tipo,
        size: dados.tamanho,
        category: "visita",
        uploaded_by: dados.enviadoPor,
      },
    },
  });

export const removeAnexo = (anexoId: string) =>
  prisma.fileAsset.update({ where: { id: anexoId }, data: { isDeleted: true, deletedAt: new Date() } });
