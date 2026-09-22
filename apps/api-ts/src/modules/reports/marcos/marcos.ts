/**
 * Motor de marcos por etapa: lê o histórico de mudança de etapa de um chamado
 * (`issue_activities` com field=state, que guarda o NOME da etapa de origem e de
 * destino) e devolve as datas que os relatórios do SAC usavam.
 *
 *  - atribuído: primeira atribuição de responsável;
 *  - início do TI: primeira entrada em "Em Desenvolvimento";
 *  - finalizado TI: ÚLTIMA saída de "Em Desenvolvimento" que não seja cancelamento
 *    (o legado também lia o último "finalizado");
 *  - homologado: última saída de "Em Teste" para uma etapa do grupo concluído;
 *  - encerrado: última entrada numa etapa encerrada, só enquanto o chamado CONTINUA
 *    encerrado. Sem histórico (chamado migrado), vale o `completed_at`;
 *  - devoluções: cada volta de "Em Teste" para "Em Desenvolvimento".
 *
 * Puro: quem busca os dados é `marcos.dao.ts`.
 */
import { STATE } from "@utils/permissions";

export type TransicaoDeEtapa = { de: string | null; para: string | null; em: Date; por: string | null };
export type Atribuicao = { usuarioId: string; em: Date };

export type ChamadoParaMarcos = {
  criadoEm: Date;
  concluidoEm: Date | null;
  etapaAtual: string | null;
  transicoes: TransicaoDeEtapa[];
  atribuicoes: Atribuicao[];
};

export type Devolucao = { em: Date; por: string | null };

export type Marcos = {
  abertoEm: Date;
  atribuidoEm: Date | null;
  inicioTiEm: Date | null;
  finalizadoTiEm: Date | null;
  finalizadoTiPor: string | null;
  homologadoEm: Date | null;
  homologadoPor: string | null;
  encerradoEm: Date | null;
  encerradoPor: string | null;
  devolucoes: Devolucao[];
};

/** Grupo (triage, backlog, unstarted, started, completed, cancelled) de uma etapa pelo nome. */
export type GrupoDaEtapa = (nome: string | null) => string | null;

export const GRUPOS_ENCERRADOS: readonly string[] = ["completed", "cancelled"];

export const isEtapaEncerrada = (grupoDaEtapa: GrupoDaEtapa, nome: string | null) =>
  GRUPOS_ENCERRADOS.includes(grupoDaEtapa(nome) ?? "");

const byData = (a: { em: Date }, b: { em: Date }) => a.em.getTime() - b.em.getTime();

const primeiraData = (datas: Date[]) =>
  datas.reduce<Date | null>((menor, d) => (menor && menor <= d ? menor : d), null);

const isFinalizacaoTi = (grupoDaEtapa: GrupoDaEtapa) => (tr: TransicaoDeEtapa) =>
  tr.de === STATE.EM_DESENVOLVIMENTO && grupoDaEtapa(tr.para) !== "cancelled";

const isHomologacao = (grupoDaEtapa: GrupoDaEtapa) => (tr: TransicaoDeEtapa) =>
  tr.de === STATE.EM_TESTE && grupoDaEtapa(tr.para) === "completed";

const isDevolucao = (tr: TransicaoDeEtapa) => tr.de === STATE.EM_TESTE && tr.para === STATE.EM_DESENVOLVIMENTO;

/** Encerramento: a última entrada numa etapa encerrada, ou o completed_at quando não há histórico. */
function readEncerramento(chamado: ChamadoParaMarcos, ordenadas: TransicaoDeEtapa[], grupoDaEtapa: GrupoDaEtapa) {
  if (!isEtapaEncerrada(grupoDaEtapa, chamado.etapaAtual)) return { em: null, por: null };
  const ultima = ordenadas.findLast((tr) => isEtapaEncerrada(grupoDaEtapa, tr.para));
  if (ultima) return { em: ultima.em, por: ultima.por };
  return { em: chamado.concluidoEm, por: null };
}

export function buildMarcos(chamado: ChamadoParaMarcos, grupoDaEtapa: GrupoDaEtapa): Marcos {
  const ordenadas = chamado.transicoes.toSorted(byData);
  const finalizacao = ordenadas.findLast(isFinalizacaoTi(grupoDaEtapa));
  const homologacao = ordenadas.findLast(isHomologacao(grupoDaEtapa));
  const encerramento = readEncerramento(chamado, ordenadas, grupoDaEtapa);

  return {
    abertoEm: chamado.criadoEm,
    atribuidoEm: primeiraData(chamado.atribuicoes.map((a) => a.em)),
    inicioTiEm: ordenadas.find((tr) => tr.para === STATE.EM_DESENVOLVIMENTO)?.em ?? null,
    finalizadoTiEm: finalizacao?.em ?? null,
    finalizadoTiPor: finalizacao?.por ?? null,
    homologadoEm: homologacao?.em ?? null,
    homologadoPor: homologacao?.por ?? null,
    encerradoEm: encerramento.em,
    encerradoPor: encerramento.por,
    devolucoes: ordenadas.filter(isDevolucao).map((tr) => ({ em: tr.em, por: tr.por })),
  };
}
