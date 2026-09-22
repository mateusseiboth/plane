/**
 * Visão geral por sistema do SAC (`visao_geral_chamados.php`): cada chamado cai
 * em pendente, em andamento, a homologar (= "Em Teste") ou concluído, e o total
 * é cruzado com o tipo (Correção, Melhoria, Projeto). Puro.
 */
import { STATE } from "@utils/permissions";
import { TIPOS_DE_CHAMADO, type TipoDoChamado } from "@modules/reports/comum/tipo-do-chamado";

export const SITUACOES_DO_SISTEMA = ["pendente", "em_andamento", "a_homologar", "concluido", "cancelado"] as const;
export type SituacaoDoSistema = (typeof SITUACOES_DO_SISTEMA)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDoSistema, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  a_homologar: "A homologar",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

/** Situação pelo grupo da etapa. O grupo "started" se divide: "Em Teste" é a homologação. */
const SITUACAO_POR_GRUPO: Record<string, (etapa: string | null) => SituacaoDoSistema> = {
  triage: () => "pendente",
  backlog: () => "pendente",
  unstarted: () => "pendente",
  started: (etapa) => (etapa === STATE.EM_TESTE ? "a_homologar" : "em_andamento"),
  completed: () => "concluido",
  cancelled: () => "cancelado",
};

export function classifySituacaoDoSistema({
  etapa,
  grupo,
}: {
  etapa: string | null;
  grupo: string | null;
}): SituacaoDoSistema {
  return (SITUACAO_POR_GRUPO[grupo ?? ""] ?? SITUACAO_POR_GRUPO.backlog)(etapa);
}

export type ContagemPorSituacao = Record<SituacaoDoSistema, number> & { total: number };
export type ContagemDoSistema = ContagemPorSituacao & { por_tipo: Record<TipoDoChamado, ContagemPorSituacao> };

export type ChamadoDoSistema = { projetoId: string; etapa: string | null; grupo: string | null; tipo: TipoDoChamado };

const createContagemPorSituacao = (): ContagemPorSituacao => ({
  pendente: 0,
  em_andamento: 0,
  a_homologar: 0,
  concluido: 0,
  cancelado: 0,
  total: 0,
});

const createContagemDoSistema = (): ContagemDoSistema => ({
  ...createContagemPorSituacao(),
  por_tipo: Object.fromEntries(TIPOS_DE_CHAMADO.map((t) => [t, createContagemPorSituacao()])) as Record<
    TipoDoChamado,
    ContagemPorSituacao
  >,
});

const addASituacao = (contagem: ContagemPorSituacao, situacao: SituacaoDoSistema) => {
  contagem[situacao]++;
  contagem.total++;
};

export function buildVisaoPorSistema(chamados: ChamadoDoSistema[]): Map<string, ContagemDoSistema> {
  const visao = new Map<string, ContagemDoSistema>();
  for (const chamado of chamados) {
    const contagem = visao.get(chamado.projetoId) ?? createContagemDoSistema();
    const situacao = classifySituacaoDoSistema(chamado);
    addASituacao(contagem, situacao);
    addASituacao(contagem.por_tipo[chamado.tipo], situacao);
    visao.set(chamado.projetoId, contagem);
  }
  return visao;
}
