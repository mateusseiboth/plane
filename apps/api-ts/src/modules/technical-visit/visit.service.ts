/**
 * Regra de negócio da visita técnica: criar (inclusive a partir de um chamado),
 * editar com as guardas de quem pode mexer em quê, trava de encerramento,
 * chamados vinculados e anexo do relatório. Query fica no DAO; a rota só lê a
 * requisição e chama daqui.
 */
import prisma from "@db";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { roleCan, EProjectAction, type EffectiveRole } from "@utils/permission-checks";
import { instanteDaEntrada } from "@utils/prazo";
import { saveAsset, serveAsset } from "@utils/storage";
import {
  findReportDenial,
  findVisitDenial,
  type VisitActor,
  type VisitDenial,
} from "@modules/technical-visit/visit-access";
import {
  findClosingErrors,
  isChamadoAberto,
  requiresClosingCheck,
  type VisitFieldError,
} from "@modules/technical-visit/visit-closing";
import {
  VisitClosingError,
  VisitError,
  VisitNotFoundError,
  VisitReferenceError,
} from "@modules/technical-visit/visit-error";
import { buildVisitListWhere, type VisitListQuery } from "@modules/technical-visit/visit-filters";
import { buildCodigoDoChamado, serializeVisit } from "@modules/technical-visit/visit-serializer";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import * as dao from "@modules/technical-visit/visit.dao";
import { paginate } from "@utils/pagination";

type Tx = Prisma.TransactionClient;
type Corpo = Record<string, unknown>;

export type VisitContext = { workspaceId: string; userId: string; role: EffectiveRole };

/** Teto do anexo: o relatório assinado é um PDF ou uma foto da folha. */
export const TAMANHO_MAXIMO_DO_ANEXO = 25 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeUuid = (valor: unknown): string | null => {
  if (typeof valor !== "string") return null;
  return valor.trim() || null;
};

const readTexto = (valor: unknown): string | null => (valor === null || valor === undefined ? null : String(valor));

const readUnicos = (valor: unknown): string[] => [...new Set(dao.readIds(valor))];

// ── Corpo da requisição → colunas ──────────────────────────────────────────────

type Campo = { coluna: string; parse: (valor: unknown) => unknown };

const CAMPOS: Record<string, Campo> = {
  technician_id: { coluna: "technicianId", parse: normalizeUuid },
  technician2_id: { coluna: "technician2Id", parse: normalizeUuid },
  entity_id: { coluna: "entityId", parse: normalizeUuid },
  contacts: { coluna: "contacts", parse: readTexto },
  city: { coluna: "city", parse: readTexto },
  scheduled_date: { coluna: "scheduledDate", parse: (v) => instanteDaEntrada(v, "inicio") },
  started_at: { coluna: "startedAt", parse: (v) => instanteDaEntrada(v, "inicio") },
  finished_at: { coluna: "finishedAt", parse: (v) => instanteDaEntrada(v, "fim") },
  status: { coluna: "status", parse: Number },
  period: { coluna: "period", parse: readTexto },
  summary: { coluna: "summary", parse: readTexto },
  conclusion: { coluna: "conclusion", parse: readTexto },
  mot_update: { coluna: "motUpdate", parse: Boolean },
  mot_bug_fix: { coluna: "motBugFix", parse: Boolean },
  mot_training: { coluna: "motTraining", parse: Boolean },
  mot_improvement: { coluna: "motImprovement", parse: Boolean },
  mot_commercial: { coluna: "motCommercial", parse: Boolean },
  mot_other: { coluna: "motOther", parse: Boolean },
  mot_other_description: { coluna: "motOtherDescription", parse: readTexto },
  project_ids: { coluna: "projectIds", parse: readUnicos },
  module_ids: { coluna: "moduleIds", parse: readUnicos },
};

// Nomes da API Django que clientes antigos ainda mandam na criação.
const APELIDOS: Record<string, string> = {
  technician: "technician_id",
  technician_2: "technician2_id",
  entity: "entity_id",
};

const withNomesAtuais = (corpo: Corpo): Corpo => {
  const faltantes = Object.entries(APELIDOS).filter(([antigo, atual]) => antigo in corpo && !(atual in corpo));
  return { ...corpo, ...Object.fromEntries(faltantes.map(([antigo, atual]) => [atual, corpo[antigo]])) };
};

const buildDados = (corpo: Corpo): Record<string, any> =>
  Object.fromEntries(
    Object.entries(CAMPOS)
      .filter(([nome]) => corpo[nome] !== undefined)
      .map(([nome, campo]) => [campo.coluna, campo.parse(corpo[nome])])
  );

// ── Referências (técnico, entidade, sistemas, funcionalidades) ─────────────────

type Referencias = {
  technicianId?: string | null;
  technician2Id?: string | null;
  entityId?: string | null;
  projectIds?: string[];
  moduleIds?: string[];
};

async function findTecnicoErrors(workspaceId: string, merged: Referencias, alterados: Referencias) {
  const pedidos = (["technicianId", "technician2Id"] as const).filter((c) => alterados[c]);
  const ids = pedidos.map((c) => alterados[c] as string).filter((id) => UUID_RE.test(id));
  const membros = await dao.findMembrosAtivos(workspaceId, ids);
  const path = { technicianId: "technician_id", technician2Id: "technician2_id" } as const;
  const erros: VisitFieldError[] = pedidos
    .filter((c) => !membros.has(alterados[c] as string))
    .map((c) => ({ path: path[c], message: "Escolha um técnico que participe do espaço." }));
  const repetido = !!merged.technician2Id && merged.technician2Id === merged.technicianId;
  return repetido ? [...erros, { path: "technician2_id", message: "O 2º técnico deve ser outra pessoa." }] : erros;
}

async function findEntidadeErrors(workspaceId: string, alterados: Referencias): Promise<VisitFieldError[]> {
  if (!alterados.entityId) return [];
  const valida = UUID_RE.test(alterados.entityId) && (await dao.findEntidade(workspaceId, alterados.entityId));
  return valida ? [] : [{ path: "entity_id", message: "Entidade não encontrada." }];
}

async function findSistemaErrors(workspaceId: string, merged: Referencias, alterados: Referencias) {
  const erros: VisitFieldError[] = [];
  const projectIds = merged.projectIds ?? [];
  const validos = await dao.findProjetosDoEspaco(
    workspaceId,
    projectIds.filter((id) => UUID_RE.test(id))
  );
  if (alterados.projectIds && projectIds.some((id) => !validos.has(id))) {
    erros.push({ path: "project_ids", message: "Sistema não encontrado." });
  }
  const moduleIds = merged.moduleIds ?? [];
  if (!(alterados.moduleIds || alterados.projectIds) || !moduleIds.length) return erros;
  const modulos = await dao.findModulosDoEspaco(
    workspaceId,
    moduleIds.filter((id) => UUID_RE.test(id))
  );
  const doSistema = modulos.filter((m) => projectIds.includes(m.projectId));
  if (doSistema.length !== moduleIds.length) {
    erros.push({ path: "module_ids", message: "Escolha funcionalidades dos sistemas da visita." });
  }
  return erros;
}

async function requireReferencias(workspaceId: string, merged: Referencias, alterados: Referencias) {
  const erros = [
    ...(await findTecnicoErrors(workspaceId, merged, alterados)),
    ...(await findEntidadeErrors(workspaceId, alterados)),
    ...(await findSistemaErrors(workspaceId, merged, alterados)),
  ];
  if (erros.length) throw new VisitReferenceError(erros);
}

// ── Guardas ────────────────────────────────────────────────────────────────────

const buildActor = (ctx: VisitContext): VisitActor => ({
  userId: ctx.userId,
  canManageAll: roleCan(ctx.role, EProjectAction.VISIT_MANAGE_ALL),
});

const requirePermitido = (negativa: VisitDenial | null) => {
  if (negativa) throw new VisitError(negativa.message, negativa.status);
};

async function requireVisita(workspaceId: string, visitId: string) {
  const visita = UUID_RE.test(visitId) ? await dao.findVisita(workspaceId, visitId) : null;
  if (!visita) throw new VisitNotFoundError();
  return visita;
}

const readChamadosVinculados = (visita: { visitIssues: any[] }) =>
  visita.visitIssues.map((link) => ({
    codigo: buildCodigoDoChamado(link.issue),
    isOpen: isChamadoAberto(link.issue.state?.group),
  }));

function requireEncerravel(visitaMesclada: any) {
  const erros = findClosingErrors(visitaMesclada, readChamadosVinculados(visitaMesclada));
  if (erros.length) throw new VisitClosingError(erros);
}

// ── Leitura ────────────────────────────────────────────────────────────────────

async function serializeComDetalhes(visita: any) {
  return serializeVisit(visita, new Date(), await dao.findDetalhesDaVisita(visita));
}

export async function getVisita(workspaceId: string, visitId: string) {
  return serializeComDetalhes(await requireVisita(workspaceId, visitId));
}

export function listVisitas(workspaceId: string, query: VisitListQuery & { cursor?: string; per_page?: string }) {
  const agora = new Date();
  const where = buildVisitListWhere(workspaceId, query, agora);
  return paginate({
    query: (skip, take) => dao.listVisitas(where, skip, take),
    count: () => dao.countVisitas(where),
    cursor: query.cursor,
    perPage: query.per_page ? Number(query.per_page) : undefined,
    transform: (visitas) => visitas.map((v) => serializeVisit(v, agora)),
  });
}

// ── Responsáveis (contatos da entidade) ────────────────────────────────────────

/**
 * Substitui os responsáveis vinculados à visita pela lista recebida. O texto
 * livre `contacts` não é tocado: os dois convivem.
 */
async function syncResponsaveis(tx: Tx, visitId: string, workspaceId: string, contactIds: unknown) {
  const ids = Array.isArray(contactIds)
    ? [...new Set(contactIds.map(normalizeUuid).filter((id): id is string => !!id))]
    : [];
  // Sem esta conferência, um id malformado vira erro de sintaxe de uuid no
  // Postgres: 500 no lugar de "pedido inválido".
  if (ids.some((id) => !UUID_RE.test(id))) throw new VisitError("Responsável inválido.", 400);
  if (!ids.length) {
    await tx.technicalVisitContact.deleteMany({ where: { visitId } });
    return;
  }
  const validos = await tx.entityContact.count({ where: { id: { in: ids }, workspaceId, deletedAt: null } });
  if (validos !== ids.length) throw new VisitError("Responsável inválido.", 400);
  await tx.technicalVisitContact.deleteMany({ where: { visitId, contactId: { notIn: ids } } });
  await tx.technicalVisitContact.createMany({
    data: ids.map((contactId) => ({ visitId, contactId, workspaceId })),
    skipDuplicates: true,
  });
}

// ── Criação ────────────────────────────────────────────────────────────────────

async function requireChamados(workspaceId: string, issueIds: string[]) {
  const validos = issueIds.filter((id) => UUID_RE.test(id));
  const chamados = await dao.findChamadosDoEspaco(workspaceId, validos);
  if (chamados.length === issueIds.length) return chamados;
  throw new VisitReferenceError([{ path: "issue_ids", message: "Chamado não encontrado." }]);
}

const readCidadeDaEntidade = async (workspaceId: string, entityId: string | null | undefined) =>
  entityId && UUID_RE.test(entityId) ? ((await dao.findEntidade(workspaceId, entityId))?.city ?? null) : null;

/**
 * Visita aberta a partir de um chamado herda dele a entidade e o sistema, como
 * no SAC. A cidade vem da entidade quando ninguém digitou outra.
 */
async function buildPadroesDaCriacao(ctx: VisitContext, dados: Record<string, any>, chamados: any[]) {
  const entityId = dados.entityId ?? chamados.find((c) => c.entityId)?.entityId ?? null;
  const projectIds = dados.projectIds ?? [...new Set(chamados.map((c) => c.projectId))];
  const city = dados.city?.trim() ? dados.city : await readCidadeDaEntidade(ctx.workspaceId, entityId);
  return { technicianId: dados.technicianId ?? ctx.userId, entityId, projectIds, city };
}

export async function createVisita(ctx: VisitContext, corpoRecebido: Corpo) {
  const corpo = withNomesAtuais(corpoRecebido);
  const dados = buildDados(corpo);
  const issueIds = readUnicos(corpo.issue_ids);
  const chamados = await requireChamados(ctx.workspaceId, issueIds);
  const padroes = await buildPadroesDaCriacao(ctx, dados, chamados);
  const merged = { ...dados, ...padroes };
  await requireReferencias(ctx.workspaceId, merged, merged);

  const visita = await prisma.$transaction(async (tx: Tx) => {
    const criada = await tx.technicalVisit.create({
      data: {
        ...merged,
        workspaceId: ctx.workspaceId,
        createdById: ctx.userId,
        status: dados.status ?? VISIT_STATUS.AGENDADA,
        visitNumber: await dao.nextVisitNumber(tx, ctx.workspaceId, new Date()),
        legacyId: typeof corpo.legacy_id === "number" ? corpo.legacy_id : null,
      },
    });
    if (issueIds.length) await dao.createVinculos(tx, criada.id, issueIds);
    if (corpo.contact_ids !== undefined) await syncResponsaveis(tx, criada.id, ctx.workspaceId, corpo.contact_ids);
    const completa = await dao.findVisitaNaTransacao(tx, criada.id);
    if (requiresClosingCheck(completa.status)) requireEncerravel(completa);
    return completa;
  });
  return serializeComDetalhes(visita);
}

// ── Edição ─────────────────────────────────────────────────────────────────────

/** Efeitos da troca de situação que não dependem de quem pede. */
function applyEfeitosDaSituacao(dados: Record<string, any>, atual: any) {
  const iniciou = dados.status === VISIT_STATUS.EM_ANDAMENTO && !dados.startedAt && !atual.startedAt;
  if (iniciou) dados.startedAt = new Date();
  // Ao concluir, o fim NÃO é preenchido com "agora": o relatório pede a hora real
  // de partida, e inventá-la faria a trava de encerramento passar sempre.
}

async function applyCidadeDaNovaEntidade(ctx: VisitContext, dados: Record<string, any>, corpo: Corpo, atual: any) {
  const trocouEntidade = dados.entityId && dados.entityId !== atual.entityId && corpo.city === undefined;
  if (trocouEntidade) dados.city = await readCidadeDaEntidade(ctx.workspaceId, dados.entityId);
}

const isEntrandoEmEncerramento = (dados: Record<string, any>, atual: any) =>
  dados.status !== undefined && dados.status !== atual.status && requiresClosingCheck(dados.status);

export async function updateVisita(ctx: VisitContext, visitId: string, corpo: Corpo) {
  const atual = await requireVisita(ctx.workspaceId, visitId);
  requirePermitido(findVisitDenial(corpo, atual, buildActor(ctx)));
  const dados = buildDados(corpo);
  applyEfeitosDaSituacao(dados, atual);
  await applyCidadeDaNovaEntidade(ctx, dados, corpo, atual);
  const merged = { ...atual, ...dados };
  await requireReferencias(
    ctx.workspaceId,
    { ...merged, projectIds: dao.readIds(merged.projectIds), moduleIds: dao.readIds(merged.moduleIds) },
    dados
  );
  if (isEntrandoEmEncerramento(dados, atual)) requireEncerravel(merged);

  const visita = await prisma.$transaction(async (tx: Tx) => {
    await tx.technicalVisit.update({ where: { id: visitId }, data: dados });
    if (corpo.contact_ids !== undefined) await syncResponsaveis(tx, visitId, ctx.workspaceId, corpo.contact_ids);
    return dao.findVisitaNaTransacao(tx, visitId);
  });
  return serializeComDetalhes(visita);
}

export async function deleteVisita(workspaceId: string, visitId: string) {
  await requireVisita(workspaceId, visitId);
  await prisma.technicalVisit.update({ where: { id: visitId }, data: { deletedAt: new Date() } });
}

// ── Chamados vinculados ────────────────────────────────────────────────────────

async function requireRelatorioEditavel(ctx: VisitContext, visitId: string) {
  const visita = await requireVisita(ctx.workspaceId, visitId);
  requirePermitido(findReportDenial(visita, buildActor(ctx)));
  return visita;
}

export async function linkChamado(ctx: VisitContext, visitId: string, issueId: unknown) {
  await requireRelatorioEditavel(ctx, visitId);
  const id = normalizeUuid(issueId);
  const [chamado] = id && UUID_RE.test(id) ? await dao.findChamadosDoEspaco(ctx.workspaceId, [id]) : [];
  if (!chamado) throw new VisitError("Chamado não encontrado.", 404);
  if (await dao.findVinculo(visitId, chamado.id)) throw new VisitError("Chamado já vinculado a esta visita.", 409);
  await prisma.$transaction((tx: Tx) => dao.createVinculos(tx, visitId, [chamado.id]));
  return getVisita(ctx.workspaceId, visitId);
}

export async function unlinkChamado(ctx: VisitContext, visitId: string, issueId: string) {
  await requireRelatorioEditavel(ctx, visitId);
  const vinculo = UUID_RE.test(issueId) ? await dao.findVinculo(visitId, issueId) : null;
  if (!vinculo) throw new VisitError("Chamado não vinculado a esta visita.", 404);
  await dao.removeVinculo(vinculo.id);
}

// ── Anexo do relatório ─────────────────────────────────────────────────────────

function requireArquivo(arquivo: unknown): File {
  const erro = (message: string) => new VisitReferenceError([{ path: "file", message }]);
  if (!(arquivo instanceof Blob)) throw erro("Escolha um arquivo.");
  if (!arquivo.size) throw erro("O arquivo está vazio.");
  if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) throw erro("O arquivo passa de 25 MB.");
  return arquivo as File;
}

/**
 * Grava o anexo. Na situação "Aguardando Assinatura" o anexo é o relatório
 * assinado e conclui a visita; se a visita ainda não pode encerrar, o arquivo
 * nem é gravado (senão ficaria um "assinado" pendurado numa visita aberta).
 */
export async function addAnexo(ctx: VisitContext, visitId: string, arquivoRecebido: unknown) {
  const visita = await requireRelatorioEditavel(ctx, visitId);
  const arquivo = requireArquivo(arquivoRecebido);
  const concluiAoAnexar = visita.status === VISIT_STATUS.AGUARDANDO_ASSINATURA;
  if (concluiAoAnexar) requireEncerravel(visita);

  const id = randomUUID();
  const asset = `visits/${visitId}/${id}`;
  await saveAsset(asset, arquivo);
  await dao.createAnexo({
    id,
    workspaceId: ctx.workspaceId,
    visitId,
    asset,
    nome: arquivo.name || "arquivo",
    tipo: arquivo.type || "application/octet-stream",
    tamanho: arquivo.size,
    enviadoPor: ctx.userId,
  });
  if (concluiAoAnexar) {
    await prisma.technicalVisit.update({ where: { id: visitId }, data: { status: VISIT_STATUS.CONCLUIDA } });
  }
  return getVisita(ctx.workspaceId, visitId);
}

export async function readAnexo(workspaceId: string, visitId: string, anexoId: string) {
  await requireVisita(workspaceId, visitId);
  const anexo = UUID_RE.test(anexoId) ? await dao.findAnexo(visitId, anexoId) : null;
  // Anexo do SAC que o importador não conseguiu baixar tem registro, mas não tem binário.
  const resposta = anexo ? await serveAsset(anexo.asset, anexo.mimeType) : null;
  if (!anexo || !resposta) throw new VisitError("Arquivo não encontrado.", 404);
  const nome = ((anexo.attributes ?? {}) as Record<string, unknown>).name as string | undefined;
  return { resposta, nome: nome ?? "arquivo" };
}

export async function removeAnexo(ctx: VisitContext, visitId: string, anexoId: string) {
  await requireRelatorioEditavel(ctx, visitId);
  const anexo = UUID_RE.test(anexoId) ? await dao.findAnexo(visitId, anexoId) : null;
  if (!anexo) throw new VisitError("Arquivo não encontrado.", 404);
  await dao.removeAnexo(anexo.id);
}
