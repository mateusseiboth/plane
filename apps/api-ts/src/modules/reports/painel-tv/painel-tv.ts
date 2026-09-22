/**
 * Painel de TV do setor (`intranet/painel/painel_ti*.php` e `painel_qld.php` do
 * SAC): colunas por etapa, os chamados de cada pessoa do setor e o alerta de
 * urgente. "Cliente parado" do SAC virou a prioridade urgente.
 *
 * Um setor = uma strategy. Setor novo é uma entrada a mais no mapa. Puro.
 */
import { STATE } from "@utils/permissions";

export const SETORES_DO_PAINEL = ["ti", "qualidade"] as const;
export type SetorDoPainel = (typeof SETORES_DO_PAINEL)[number];

export const isSetorDoPainel = (valor: unknown): valor is SetorDoPainel =>
  SETORES_DO_PAINEL.includes(valor as SetorDoPainel);

export type ChamadoDoPainel = { id: string; etapa: string | null; prioridade: string; responsaveis: string[] };

type ColunaDoPainel = { chave: string; rotulo: string; etapa: string };

type PainelStrategy = {
  titulo: string;
  /** Chave da função (WorkflowRole) de quem é do setor. */
  funcao: string;
  colunas: ColunaDoPainel[];
  /** Etapas em que um urgente parado dispara o alerta sonoro. */
  etapasDeAlerta: string[];
};

const PAINEIS: Record<SetorDoPainel, PainelStrategy> = {
  ti: {
    titulo: "Painel do TI",
    funcao: "ti",
    colunas: [
      { chave: "a_fazer", rotulo: "A fazer", etapa: STATE.A_FAZER },
      { chave: "em_desenvolvimento", rotulo: "Em desenvolvimento", etapa: STATE.EM_DESENVOLVIMENTO },
      { chave: "em_teste", rotulo: "Em homologação", etapa: STATE.EM_TESTE },
    ],
    // No SAC: cliente parado no TI que ninguém pegou.
    etapasDeAlerta: [STATE.A_FAZER],
  },
  qualidade: {
    titulo: "Painel da Qualidade",
    funcao: "qualidade",
    colunas: [
      { chave: "verificar", rotulo: "Verificar", etapa: STATE.TRIAGEM },
      { chave: "analisar", rotulo: "Analisar", etapa: STATE.EM_ANALISE },
      { chave: "homologar", rotulo: "Homologar", etapa: STATE.EM_TESTE },
    ],
    // No SAC: cliente parado na Qualidade sem ninguém, ou esperando homologação.
    etapasDeAlerta: [STATE.TRIAGEM, STATE.EM_TESTE],
  },
};

export const createPainelStrategy = (setor: SetorDoPainel): PainelStrategy => PAINEIS[setor];

/** Etapas que o painel do setor mostra (o DAO só busca estas). */
export const readEtapasDoPainel = (setor: SetorDoPainel) => PAINEIS[setor].colunas.map((c) => c.etapa);

const percentualDe = (parte: number, total: number) => (total ? Math.round((parte / total) * 1000) / 10 : 0);

function groupPorPessoa<T extends ChamadoDoPainel>(chamados: T[], isDoSetor: (usuarioId: string) => boolean) {
  const porPessoa = new Map<string, T[]>();
  for (const chamado of chamados) {
    for (const usuarioId of chamado.responsaveis.filter(isDoSetor)) {
      porPessoa.set(usuarioId, [...(porPessoa.get(usuarioId) ?? []), chamado]);
    }
  }
  return [...porPessoa.entries()].map(([usuarioId, lista]) => ({ usuarioId, chamados: lista }));
}

export function buildPainel<T extends ChamadoDoPainel>(
  setor: SetorDoPainel,
  chamados: T[],
  funcaoDe: (usuarioId: string) => string | null
) {
  const painel = createPainelStrategy(setor);
  const etapas = new Set(painel.colunas.map((c) => c.etapa));
  const doPainel = chamados.filter((c) => etapas.has(c.etapa ?? ""));
  const total = doPainel.length;
  const colunas = painel.colunas.map((coluna) => {
    const lista = doPainel.filter((c) => c.etapa === coluna.etapa);
    return {
      chave: coluna.chave,
      rotulo: coluna.rotulo,
      etapa: coluna.etapa,
      total: lista.length,
      percentual: percentualDe(lista.length, total),
      chamados: lista,
    };
  });

  return {
    setor,
    titulo: painel.titulo,
    total,
    colunas,
    por_pessoa: groupPorPessoa(doPainel, (usuarioId) => funcaoDe(usuarioId) === painel.funcao),
    alertas: doPainel.filter((c) => c.prioridade === "urgent" && painel.etapasDeAlerta.includes(c.etapa ?? "")),
  };
}
