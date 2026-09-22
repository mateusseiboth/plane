/**
 * Log consolidado de chamados com filtros de etapa (a atual do chamado), função
 * de quem agiu, pessoa, período e sistema. Devolve até `limite` linhas, as mais
 * recentes, e avisa quando o filtro tinha mais que isso.
 */
import { formatNumeroDoChamado } from "@utils/numero-do-chamado";
import { DEFAULT_STATES } from "@utils/project-defaults";
import { findFuncoesDoEspaco, findFuncoesDosMembros } from "@modules/reports/comum/funcoes.dao";
import { issueWhere, userNameMap, withoutPeriodo, type Filters } from "@modules/reports/comum/filtros";
import { describeAtividade, mergeLogDeChamados } from "@modules/reports/log-chamados/log-chamados";
import {
  findAtividadesDoLog,
  findComentariosDoLog,
  type ChamadoDoLog,
  type FiltroDoLog,
} from "@modules/reports/log-chamados/log-chamados.dao";

const LIMITE_PADRAO = 500;
const LIMITE_MAXIMO = 2000;
const TAMANHO_DO_VALOR = 120;

export type ParamsDoLog = { filtros: Filters; etapa?: string; funcao?: string; usuarioId?: string; limite?: number };

export const readLimite = (valor: unknown) => Math.min(Math.max(Number(valor) || LIMITE_PADRAO, 1), LIMITE_MAXIMO);

const truncate = (texto: string | null | undefined) =>
  texto && texto.length > TAMANHO_DO_VALOR ? `${texto.slice(0, TAMANHO_DO_VALOR)}…` : (texto ?? null);

type LinhaDoLog = {
  id: string;
  tipo: "atividade" | "comentario";
  em: Date;
  acao: string;
  de: string | null;
  para: string | null;
  texto: string | null;
  autorId: string | null;
  chamado: ChamadoDoLog;
};

const serializeChamadoDoLog = (c: ChamadoDoLog) => ({
  id: c.id,
  ticket_number: formatNumeroDoChamado(c),
  identifier: c.project ? `${c.project.identifier}-${c.sequenceId}` : null,
  name: c.name,
  project: c.project?.name ?? null,
  state: c.state?.name ?? null,
});

/** Autores permitidos pelos filtros de função e de pessoa; undefined = sem filtro. */
function readAutores(funcoes: Map<string, { key: string }>, p: ParamsDoLog): string[] | undefined {
  if (!p.funcao && !p.usuarioId) return undefined;
  return [...funcoes.keys()].filter(
    (id) => (!p.funcao || funcoes.get(id)?.key === p.funcao) && (!p.usuarioId || id === p.usuarioId)
  );
}

export async function findLogDeChamados(workspaceId: string, p: ParamsDoLog) {
  const limite = p.limite ?? LIMITE_PADRAO;
  const funcoes = await findFuncoesDosMembros(workspaceId);
  const filtro: FiltroDoLog = {
    issue: issueWhere(workspaceId, withoutPeriodo(p.filtros), p.etapa ? { state: { name: p.etapa } } : {}),
    criadoEm: p.filtros.dateFrom || p.filtros.dateTo ? { gte: p.filtros.dateFrom, lte: p.filtros.dateTo } : undefined,
    autores: readAutores(funcoes, p),
    limite,
  };
  const [atividades, comentarios, opcoesDeFuncao] = await Promise.all([
    findAtividadesDoLog(filtro),
    findComentariosDoLog(filtro),
    findFuncoesDoEspaco(workspaceId),
  ]);

  const linhas = mergeLogDeChamados<LinhaDoLog>(
    atividades.linhas.map((a) => ({
      id: a.id,
      tipo: "atividade",
      em: a.createdAt,
      acao: describeAtividade({ verb: a.verb, field: a.field }),
      de: truncate(a.oldValue),
      para: truncate(a.newValue),
      texto: null,
      autorId: a.actorId,
      chamado: a.issue,
    })),
    comentarios.linhas.map((c) => ({
      id: c.id,
      tipo: "comentario",
      em: c.createdAt,
      acao: describeAtividade({ verb: "created", field: "comment" }),
      de: null,
      para: null,
      texto: truncate(c.commentStripped),
      autorId: c.actorId,
      chamado: c.issue,
    }))
  ).slice(0, limite);

  const nomes = await userNameMap(linhas.map((l) => l.autorId));
  const total = atividades.total + comentarios.total;

  return {
    total,
    truncado: total > linhas.length,
    funcoes: opcoesDeFuncao,
    etapas: DEFAULT_STATES.map((s) => s.name),
    rows: linhas.map(({ autorId, chamado, em, ...linha }) => ({
      ...linha,
      em: em.toISOString(),
      usuario: { id: autorId, name: autorId ? (nomes.get(autorId) ?? "—") : "Sistema" },
      funcao: autorId ? (funcoes.get(autorId) ?? null) : null,
      chamado: serializeChamadoDoLog(chamado),
    })),
  };
}
