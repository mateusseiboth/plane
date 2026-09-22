/**
 * Balanço de chamados por mês ou por ano (`balanco_mensal_chamados.php` e
 * `balanco_anual_chamados.php` do SAC), com saldo acumulado.
 *
 *  - saldo anterior: chamados abertos antes do período e ainda não encerrados no início dele;
 *  - abertos / encerrados: dentro do período;
 *  - diferença: encerrados menos abertos (era o "saldo" do balanço mensal do SAC);
 *  - saldo atual: saldo anterior + abertos - encerrados (o "saldo" do anual).
 *
 * Mês e ano em horário de Brasília. Cancelado também sai do saldo: o saldo é o
 * que continua em aberto. Puro.
 */
import { fromBrasilia, toBrasilia } from "@modules/reports/comum/periodo";

export const GRANULARIDADES = ["mes", "ano"] as const;
export type Granularidade = (typeof GRANULARIDADES)[number];

export const isGranularidade = (valor: unknown): valor is Granularidade =>
  GRANULARIDADES.includes(valor as Granularidade);

export type ChamadoDoBalanco = { criadoEm: Date; encerradoEm: Date | null };

export type LinhaDoBalanco = {
  periodo: string;
  inicio: Date;
  saldo_anterior: number;
  abertos: number;
  encerrados: number;
  diferenca: number;
  saldo_atual: number;
};

type Balde = { chave: string; inicio: Date; fim: Date };

type EstrategiaDeBalde = {
  chave: (local: Date) => string;
  /** Início (relógio de Brasília) do balde que contém `local`. */
  inicioDoBalde: (local: Date) => Date;
  /** Início (relógio de Brasília) do balde seguinte. */
  proximo: (inicioLocal: Date) => Date;
};

const ESTRATEGIAS: Record<Granularidade, EstrategiaDeBalde> = {
  mes: {
    chave: (local) => local.toISOString().slice(0, 7),
    inicioDoBalde: (local) => new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)),
    proximo: (inicio) => new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1)),
  },
  ano: {
    chave: (local) => String(local.getUTCFullYear()),
    inicioDoBalde: (local) => new Date(Date.UTC(local.getUTCFullYear(), 0, 1)),
    proximo: (inicio) => new Date(Date.UTC(inicio.getUTCFullYear() + 1, 0, 1)),
  },
};

function buildBaldes(inicio: Date, fim: Date, estrategia: EstrategiaDeBalde): Balde[] {
  const baldes: Balde[] = [];
  const fimLocal = toBrasilia(fim);
  for (let local = estrategia.inicioDoBalde(toBrasilia(inicio)); local <= fimLocal; local = estrategia.proximo(local)) {
    baldes.push({
      chave: estrategia.chave(local),
      inicio: fromBrasilia(local),
      fim: fromBrasilia(estrategia.proximo(local)),
    });
  }
  return baldes;
}

const isEntre = (d: Date | null, inicio: Date, fim: Date) => !!d && d >= inicio && d < fim;

const isAbertoEm = (instante: Date) => (c: ChamadoDoBalanco) =>
  c.criadoEm < instante && (!c.encerradoEm || c.encerradoEm >= instante);

export function buildBalanco(params: {
  chamados: ChamadoDoBalanco[];
  inicio: Date;
  fim: Date;
  granularidade: Granularidade;
}) {
  const { chamados, inicio, fim, granularidade } = params;
  const baldes = buildBaldes(inicio, fim, ESTRATEGIAS[granularidade]);
  const saldoInicial = baldes.length ? chamados.filter(isAbertoEm(baldes[0].inicio)).length : 0;

  let saldo = saldoInicial;
  const linhas: LinhaDoBalanco[] = baldes.map((balde) => {
    const abertos = chamados.filter((c) => isEntre(c.criadoEm, balde.inicio, balde.fim)).length;
    const encerrados = chamados.filter((c) => isEntre(c.encerradoEm, balde.inicio, balde.fim)).length;
    const linha = {
      periodo: balde.chave,
      inicio: balde.inicio,
      saldo_anterior: saldo,
      abertos,
      encerrados,
      diferenca: encerrados - abertos,
      saldo_atual: saldo + abertos - encerrados,
    };
    saldo = linha.saldo_atual;
    return linha;
  });

  return {
    linhas,
    totais: {
      saldo_inicial: saldoInicial,
      abertos: linhas.reduce((s, l) => s + l.abertos, 0),
      encerrados: linhas.reduce((s, l) => s + l.encerrados, 0),
      saldo_final: saldo,
    },
  };
}
