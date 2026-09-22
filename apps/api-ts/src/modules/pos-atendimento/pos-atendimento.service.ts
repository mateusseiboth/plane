/**
 * Service do pós-atendimento: fila (chamados e visitas concluídos), registro,
 * verificação da Qualidade, painel do detalhe e relatório de satisfação.
 *
 * A permissão (`posatendimento.record`, `.verify`, `report.view`) é checada na rota;
 * aqui chegam só `canVerify` e os sistemas da pessoa. Dependências injetadas para o
 * teste unitário.
 */
import { POS_ORIGEM, type PosOrigem } from "@modules/pos-atendimento/pos-atendimento.codes";
import type {
  IssueComPosRow,
  IssueItemRow,
  PosAtendimentoDao,
  PosComAlvoRow,
  PosRelatorioRow,
  PosRow,
  VisitComPosRow,
  VisitItemRow,
} from "@modules/pos-atendimento/pos-atendimento.dao";
import {
  PosConflictError,
  PosNotConcludedError,
  PosNotFoundError,
  PosValidationError,
} from "@modules/pos-atendimento/pos-atendimento.errors";
import {
  buildIssueWhere,
  buildRelatorioWhere,
  buildVisitWhere,
  type PosEscopo,
} from "@modules/pos-atendimento/pos-atendimento.query";
import {
  buildSatisfacao,
  getConcluidoEm,
  isUuid,
  mergeByConcluidoEm,
  parseFilaFiltros,
  parseRelatorioFiltros,
  validatePosInput,
  validateVerifyInput,
  type FilaFiltros,
  type FilaOrigem,
} from "@modules/pos-atendimento/pos-atendimento.rules";
import {
  findVisitProjectIds,
  serializeIssueItem,
  serializePessoa,
  serializePos,
  serializeVisitItem,
  type PessoasPorId,
  type PosDto,
  type PosFilaItemDto,
  type SistemaDto,
} from "@modules/pos-atendimento/pos-atendimento.serialize";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";
import { paginate } from "@utils/pagination";

export type PosDeps = { dao: PosAtendimentoDao; now: () => Date };

export type PosContext = { workspaceId: string; userId: string; canVerify: boolean; projectIds: string[] };

type Body = Record<string, unknown>;

/** Um item da fila antes de virar contrato: a linha do chamado ou da visita e o pós, se houver. */
type Candidato =
  | { origem: typeof POS_ORIGEM.CHAMADO; concluidoEm: Date; row: IssueItemRow; pos: PosRow | null }
  | { origem: typeof POS_ORIGEM.VISITA; concluidoEm: Date; row: VisitItemRow; pos: PosRow | null };

type Alvo = { isConcluido: boolean; pos: PosRow | null };

type AlvoStrategy = {
  find: (ctx: PosContext, id: string) => Promise<Alvo | null>;
  link: (id: string) => { issueId: string } | { visitId: string };
  notFound: string;
  notConcluded: string;
  duplicated: string;
};

type Fonte = {
  count: (escopo: PosEscopo, filtros: FilaFiltros) => Promise<number>;
  find: (escopo: PosEscopo, filtros: FilaFiltros, take: number) => Promise<Candidato[]>;
};

const POR_PAGINA = 25;
const POR_PAGINA_MAXIMO = 1000;

const FONTES_DA_ORIGEM: Record<FilaOrigem, PosOrigem[]> = {
  all: [POS_ORIGEM.CHAMADO, POS_ORIGEM.VISITA],
  [POS_ORIGEM.CHAMADO]: [POS_ORIGEM.CHAMADO],
  [POS_ORIGEM.VISITA]: [POS_ORIGEM.VISITA],
};

const toIssueCandidato = ({ posAtendimento, ...row }: IssueComPosRow): Candidato => ({
  origem: POS_ORIGEM.CHAMADO,
  concluidoEm: getConcluidoEm(row),
  row,
  pos: posAtendimento,
});

const toVisitCandidato = ({ posAtendimento, ...row }: VisitComPosRow): Candidato => ({
  origem: POS_ORIGEM.VISITA,
  concluidoEm: getConcluidoEm(row),
  row,
  pos: posAtendimento,
});

/** O CHECK da tabela garante: sem chamado, há visita. */
const toCandidatoDoRelatorio = ({ issue, visit, ...pos }: PosComAlvoRow): Candidato => {
  if (issue) return { origem: POS_ORIGEM.CHAMADO, concluidoEm: getConcluidoEm(issue), row: issue, pos };
  const row = visit as VisitItemRow;
  return { origem: POS_ORIGEM.VISITA, concluidoEm: getConcluidoEm(row), row, pos };
};

type Referencia = { id: string; name: string };

const readPerPage = (query: Body): number => {
  const pedido = Number(query.per_page);
  return Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, POR_PAGINA_MAXIMO) : POR_PAGINA;
};

const toEscopo = (ctx: PosContext): PosEscopo => ({ workspaceId: ctx.workspaceId, projectIds: ctx.projectIds });

export function createPosAtendimentoService({ dao, now }: PosDeps) {
  const ALVOS: Record<PosOrigem, AlvoStrategy> = {
    [POS_ORIGEM.CHAMADO]: {
      find: async (ctx, id) => {
        const issue = await dao.findIssueAlvo(ctx.workspaceId, id, ctx.projectIds);
        return issue && { isConcluido: issue.state?.group === "completed", pos: issue.posAtendimento };
      },
      link: (id) => ({ issueId: id }),
      notFound: "Chamado não encontrado.",
      notConcluded: "Conclua o chamado antes de fazer o pós-atendimento.",
      duplicated: "Este chamado já tem pós-atendimento.",
    },
    [POS_ORIGEM.VISITA]: {
      find: async (ctx, id) => {
        const visit = await dao.findVisitAlvo(ctx.workspaceId, id);
        return visit && { isConcluido: visit.status === VISIT_STATUS.CONCLUIDA, pos: visit.posAtendimento };
      },
      link: (id) => ({ visitId: id }),
      notFound: "Visita não encontrada.",
      notConcluded: "Conclua a visita antes de fazer o pós-atendimento.",
      duplicated: "Esta visita já tem pós-atendimento.",
    },
  };

  const FONTES: Record<PosOrigem, Fonte> = {
    [POS_ORIGEM.CHAMADO]: {
      count: (escopo, filtros) => dao.countIssues(buildIssueWhere(escopo, filtros)),
      find: async (escopo, filtros, take) =>
        (await dao.findIssues(buildIssueWhere(escopo, filtros), take)).map(toIssueCandidato),
    },
    [POS_ORIGEM.VISITA]: {
      count: (escopo, filtros) => dao.countVisits(buildVisitWhere(escopo, filtros)),
      find: async (escopo, filtros, take) =>
        (await dao.findVisits(buildVisitWhere(escopo, filtros), take)).map(toVisitCandidato),
    },
  };

  const findPessoas = async (ids: (string | null)[]): Promise<PessoasPorId> => {
    const unicos = [...new Set(ids.filter((id): id is string => !!id))];
    const pessoas = unicos.length ? await dao.findUsuarios(unicos) : [];
    return new Map(pessoas.map((p) => [p.id, serializePessoa(p)]));
  };

  const findSistemas = async (candidatos: Candidato[]): Promise<Map<string, SistemaDto>> => {
    const ids = [
      ...new Set(candidatos.flatMap((c) => (c.origem === POS_ORIGEM.VISITA ? findVisitProjectIds(c.row) : []))),
    ];
    const projetos = ids.length ? await dao.findProjects(ids) : [];
    return new Map(projetos.map((p) => [p.id, p]));
  };

  /** Nomes de quem registrou/verificou e dos sistemas das visitas: uma consulta de cada para a página toda. */
  const hydrate = async (candidatos: Candidato[]): Promise<PosFilaItemDto[]> => {
    const [pessoas, sistemas] = await Promise.all([
      findPessoas(candidatos.flatMap((c) => [c.pos?.recordedById ?? null, c.pos?.verifiedById ?? null])),
      findSistemas(candidatos),
    ]);
    return candidatos.map((c) =>
      c.origem === POS_ORIGEM.CHAMADO
        ? serializeIssueItem(c.row, c.pos, pessoas)
        : serializeVisitItem(c.row, c.pos, pessoas, sistemas)
    );
  };

  const hydratePos = async (pos: PosRow): Promise<PosDto> =>
    serializePos(pos, await findPessoas([pos.recordedById, pos.verifiedById]));

  // Id malformado chegaria cru ao Postgres (coluna uuid) e viraria 500.
  const requireAlvo = async (ctx: PosContext, origem: PosOrigem, id: string): Promise<Alvo> => {
    const alvo = isUuid(id) ? await ALVOS[origem].find(ctx, id) : null;
    if (!alvo) throw new PosNotFoundError(ALVOS[origem].notFound);
    return alvo;
  };

  /** Pós de chamado fora dos sistemas da pessoa não existe para ela. */
  const requirePosVisivel = async (ctx: PosContext, id: string): Promise<PosRow> => {
    const encontrado = isUuid(id) ? await dao.findPos(ctx.workspaceId, id) : null;
    const isVisivel = !!encontrado && (!encontrado.issue || ctx.projectIds.includes(encontrado.issue.projectId));
    if (!isVisivel) throw new PosNotFoundError();
    const { issue: _issue, ...pos } = encontrado;
    return pos;
  };

  // Quem verifica (a Qualidade) e registra já deixa verificado: no legado,
  // `concluiVisitaPos.php` fazia isso para o setor Qualidade.
  const buildVerificacaoAutomatica = (ctx: PosContext) =>
    ctx.canVerify ? { verifiedAt: now(), verifiedById: ctx.userId } : {};

  return {
    async list(ctx: PosContext, query: Body) {
      const filtros = parseFilaFiltros(query);
      const escopo = toEscopo(ctx);
      const fontes = FONTES_DA_ORIGEM[filtros.origem].map((origem) => FONTES[origem]);
      return paginate<Candidato>({
        cursor: typeof query.cursor === "string" ? query.cursor : undefined,
        perPage: readPerPage(query),
        count: async () => (await Promise.all(fontes.map((f) => f.count(escopo, filtros)))).reduce((a, b) => a + b, 0),
        query: async (skip, take) => {
          const [primeira, segunda = []] = await Promise.all(fontes.map((f) => f.find(escopo, filtros, skip + take)));
          return mergeByConcluidoEm(primeira, segunda, skip, take);
        },
        transform: hydrate,
      });
    },

    async getByAlvo(ctx: PosContext, origem: PosOrigem, id: string) {
      const alvo = await requireAlvo(ctx, origem, id);
      return { concluido: alvo.isConcluido, pos: alvo.pos ? await hydratePos(alvo.pos) : null };
    },

    async record(ctx: PosContext, origem: PosOrigem, id: string, body: Body): Promise<PosDto> {
      const estrategia = ALVOS[origem];
      const alvo = await requireAlvo(ctx, origem, id);
      if (alvo.pos) throw new PosConflictError(estrategia.duplicated);
      if (!alvo.isConcluido) throw new PosNotConcludedError(estrategia.notConcluded);
      const { data, errors } = validatePosInput(body ?? {}, { origem, canVerify: ctx.canVerify });
      if (errors.length) throw new PosValidationError(errors);
      const pos = await dao.createPos({
        workspaceId: ctx.workspaceId,
        ...estrategia.link(id),
        ...data,
        recordedById: ctx.userId,
        recordedAt: now(),
        ...buildVerificacaoAutomatica(ctx),
      });
      return hydratePos(pos);
    },

    async verify(ctx: PosContext, id: string, body: Body): Promise<PosDto> {
      const pos = await requirePosVisivel(ctx, id);
      if (pos.verifiedAt) throw new PosConflictError("Este pós-atendimento já foi verificado.");
      const { comment } = validateVerifyInput(body ?? {});
      const atualizado = await dao.updatePos(pos.id, {
        verifiedAt: now(),
        verifiedById: ctx.userId,
        verificationComment: comment,
      });
      return hydratePos(atualizado);
    },

    async report(ctx: PosContext, query: Body) {
      const where = buildRelatorioWhere(toEscopo(ctx), parseRelatorioFiltros(query));
      const linhas = await dao.findPosParaRelatorio(where);
      const idsDasVisitas = [...new Set(linhas.flatMap((l) => (l.visit ? findVisitProjectIds(l.visit) : [])))];
      const projetos = idsDasVisitas.length ? await dao.findProjects(idsDasVisitas) : [];
      const sistemaPorId = new Map(projetos.map((p) => [p.id, { id: p.id, name: p.name }]));
      const sistemasDaLinha = (l: PosRelatorioRow): Referencia[] =>
        l.issue
          ? [l.issue.project]
          : findVisitProjectIds(l.visit ?? { projectIds: [] })
              .map((pid) => sistemaPorId.get(pid))
              .filter((ref): ref is Referencia => !!ref);
      return buildSatisfacao(
        linhas.map((l) => ({
          classificacao: l.classificacao,
          expectativa: l.expectativa,
          sistemas: sistemasDaLinha(l),
          entidade: l.issue?.entity ?? l.visit?.entity ?? null,
        }))
      );
    },

    /** Lista do relatório (por nota), do contato mais recente para o mais antigo. */
    async reportItems(ctx: PosContext, query: Body) {
      const where = buildRelatorioWhere(toEscopo(ctx), parseRelatorioFiltros(query));
      return paginate({
        cursor: typeof query.cursor === "string" ? query.cursor : undefined,
        perPage: readPerPage(query),
        count: () => dao.countPosDoRelatorio(where),
        query: async (skip, take) => (await dao.findPosDoRelatorio(where, skip, take)).map(toCandidatoDoRelatorio),
        transform: hydrate,
      });
    },
  };
}

export type PosAtendimentoService = ReturnType<typeof createPosAtendimentoService>;
