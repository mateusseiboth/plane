/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras puras do painel da home: grupos de prazo, prazo e tempo relativos,
 * texto dos eventos, ranking e duração. Tudo em pt-BR e no fuso de quem olha.
 */
import { differenceInCalendarDays, endOfWeek } from "date-fns";
import type {
  TChamadoDoPainel,
  TEventoDaHome,
  TPeriodoDoPainel,
  TRankingDoMes,
  TTarefaDaHome,
  TTipoDeEvento,
} from "@/services/home-painel.service";

export const PERIODOS_DO_PAINEL: { valor: TPeriodoDoPainel; rotulo: string }[] = [
  { valor: "semana", rotulo: "Semana" },
  { valor: "mes", rotulo: "Mês" },
  { valor: "trimestre", rotulo: "Trimestre" },
];

export type TChaveDoPrazo = "hoje" | "amanha" | "esta_semana" | "depois" | "atrasados";

export type TGrupoDePrazo = { chave: TChaveDoPrazo; rotulo: string; tarefas: TTarefaDaHome[] };

type TRegraDoPrazo = { chave: TChaveDoPrazo; rotulo: string; isDoGrupo: (prazo: Date, agora: Date) => boolean };

/**
 * Avaliadas nesta ordem, a primeira que casa leva a tarefa. "Atrasados" vem
 * primeiro porque o que venceu hoje mais cedo já não é "Hoje".
 */
const REGRAS_DO_PRAZO: TRegraDoPrazo[] = [
  { chave: "atrasados", rotulo: "Atrasados", isDoGrupo: (prazo, agora) => prazo < agora },
  { chave: "hoje", rotulo: "Hoje", isDoGrupo: (prazo, agora) => differenceInCalendarDays(prazo, agora) === 0 },
  { chave: "amanha", rotulo: "Amanhã", isDoGrupo: (prazo, agora) => differenceInCalendarDays(prazo, agora) === 1 },
  {
    chave: "esta_semana",
    rotulo: "Esta semana",
    isDoGrupo: (prazo, agora) => prazo <= endOfWeek(agora, { weekStartsOn: 1 }),
  },
  { chave: "depois", rotulo: "Depois", isDoGrupo: () => true },
];

/** Ordem em que os grupos aparecem na tela. */
const ORDEM_DOS_GRUPOS: TChaveDoPrazo[] = ["hoje", "amanha", "esta_semana", "depois", "atrasados"];

const readRegraDoPrazo = (prazo: Date, agora: Date) =>
  REGRAS_DO_PRAZO.find((regra) => regra.isDoGrupo(prazo, agora)) as TRegraDoPrazo;

export function groupTarefasPorPrazo(tarefas: TTarefaDaHome[], agora: Date): TGrupoDePrazo[] {
  const porChave = new Map<TChaveDoPrazo, TGrupoDePrazo>();
  for (const tarefa of tarefas) {
    if (!tarefa.target_date) continue;
    const regra = readRegraDoPrazo(new Date(tarefa.target_date), agora);
    const grupo = porChave.get(regra.chave) ?? { chave: regra.chave, rotulo: regra.rotulo, tarefas: [] };
    grupo.tarefas.push(tarefa);
    porChave.set(regra.chave, grupo);
  }
  return ORDEM_DOS_GRUPOS.flatMap((chave) => porChave.get(chave) ?? []);
}

const RELATIVO_CURTO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const RELATIVO_NUMERICO = new Intl.RelativeTimeFormat("pt-BR", { numeric: "always" });

/** "hoje", "amanhã" e "ontem" por extenso; o resto em número ("em 5 dias", "há 2 dias"). */
const formatDias = (dias: number) =>
  Math.abs(dias) <= 1 ? RELATIVO_CURTO.format(dias, "day") : RELATIVO_NUMERICO.format(dias, "day");

export const formatPrazoRelativo = (prazo: string, agora: Date) =>
  formatDias(differenceInCalendarDays(new Date(prazo), agora));

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });

type TRegraDoTempo = {
  isDaFaixa: (instante: Date, agora: Date) => boolean;
  format: (instante: Date, agora: Date) => string;
};

const decorrido = (instante: Date, agora: Date) => agora.getTime() - instante.getTime();

/** Primeira faixa que casa decide o texto. */
const REGRAS_DO_TEMPO: TRegraDoTempo[] = [
  { isDaFaixa: (i, a) => decorrido(i, a) < MINUTO_MS, format: () => "agora mesmo" },
  {
    isDaFaixa: (i, a) => decorrido(i, a) < HORA_MS,
    format: (i, a) => RELATIVO_NUMERICO.format(-Math.floor(decorrido(i, a) / MINUTO_MS), "minute"),
  },
  {
    isDaFaixa: (i, a) => decorrido(i, a) < DIA_MS && differenceInCalendarDays(a, i) === 0,
    format: (i, a) => RELATIVO_NUMERICO.format(-Math.floor(decorrido(i, a) / HORA_MS), "hour"),
  },
  {
    isDaFaixa: (i, a) => differenceInCalendarDays(a, i) < 7,
    format: (i, a) => formatDias(-differenceInCalendarDays(a, i)),
  },
  { isDaFaixa: () => true, format: (i) => DATA_CURTA.format(i) },
];

export function formatTempoRelativo(instante: string, agora: Date): string {
  const quando = new Date(instante);
  const regra = REGRAS_DO_TEMPO.find((r) => r.isDaFaixa(quando, agora)) as TRegraDoTempo;
  return regra.format(quando, agora);
}

/** O número anual; sem ele, o identificador do sistema com o sequencial. */
export const readReferenciaDoChamado = (chamado: TChamadoDoPainel) =>
  chamado.numero ?? `${chamado.project_identifier}-${chamado.sequence_id}`;

export type TTextoDoEvento = { acao: string; referencia: string; complemento: string | null };

/** O verbo de cada tipo de evento; o chamado entra depois, como link. */
const TEXTO_POR_TIPO: Record<TTipoDeEvento, { acao: string; complemento: (e: TEventoDaHome) => string | null }> = {
  abertura: { acao: "Abriu o chamado", complemento: () => null },
  etapa: { acao: "Moveu o chamado", complemento: (e) => (e.etapa ? `para ${e.etapa}` : null) },
  conclusao: { acao: "Concluiu o chamado", complemento: () => null },
  comentario: { acao: "Comentou no chamado", complemento: () => null },
  solicitacao_atendida: { acao: "Atendeu a solicitação do chamado", complemento: () => null },
};

export function buildTextoDoEvento(evento: TEventoDaHome): TTextoDoEvento {
  const texto = TEXTO_POR_TIPO[evento.tipo];
  return {
    acao: texto.acao,
    referencia: readReferenciaDoChamado(evento.chamado),
    complemento: texto.complemento(evento),
  };
}

export const readTextoDoEvento = (evento: TEventoDaHome) => {
  const { acao, referencia, complemento } = buildTextoDoEvento(evento);
  return [acao, referencia, complemento].filter(Boolean).join(" ");
};

/** Marcador de valor ausente no cartão de números. */
export const SEM_VALOR = "–";

export function formatRanking({ posicao, total_pessoas }: TRankingDoMes): { valor: string; detalhe: string } {
  if (posicao === null) return { valor: SEM_VALOR, detalhe: "sem encerrados no mês" };
  return { valor: `${posicao}º`, detalhe: `de ${total_pessoas} ${total_pessoas === 1 ? "pessoa" : "pessoas"}` };
}

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** Até dois dias em horas; dali em diante em dias, com uma casa. */
export function formatDuracao(horas: number | null): string {
  if (horas === null) return SEM_VALOR;
  if (horas < 1) return "< 1 h";
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${DECIMAL.format(horas / 24)} dias`;
}

/** "2026-09-07" → "07/09". A data já vem no dia do escritório; não passa por `Date`. */
export const formatDiaDoEixo = (data: string) => {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
};

const DATA_LONGA = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" });

/** "12 de março de 2024". */
export const formatDataLonga = (instante: string) => DATA_LONGA.format(new Date(instante));

type TEventoEmTempoReal = { entity: string; actor?: string | null };

/** Quais eventos do canal em tempo real mexem no painel de quem está olhando. */
const EVENTOS_DO_PAINEL: Record<string, (evento: TEventoEmTempoReal, userId: string) => boolean> = {
  issue: () => true,
  comment: (evento, userId) => evento.actor === userId,
};

export const isEventoDoPainel = (evento: TEventoEmTempoReal, userId: string) =>
  Object.hasOwn(EVENTOS_DO_PAINEL, evento.entity) && EVENTOS_DO_PAINEL[evento.entity](evento, userId);

type TResumoDoDia = { meus_atrasados: number; meus_vencem_hoje: number; meus_abertos: number };

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

/** A primeira situação que existe vira a frase: atraso, depois o que vence hoje, depois o total. */
const FRASES_DO_DIA: { isDoCaso: (r: TResumoDoDia) => boolean; frase: (r: TResumoDoDia) => string }[] = [
  {
    isDoCaso: (r) => r.meus_atrasados > 0,
    frase: (r) => plural(r.meus_atrasados, "chamado passou do prazo", "chamados passaram do prazo"),
  },
  {
    isDoCaso: (r) => r.meus_vencem_hoje > 0,
    frase: (r) => plural(r.meus_vencem_hoje, "chamado vence hoje", "chamados vencem hoje"),
  },
  {
    isDoCaso: (r) => r.meus_abertos > 0,
    frase: (r) => plural(r.meus_abertos, "chamado aberto com você", "chamados abertos com você"),
  },
  { isDoCaso: () => true, frase: () => "Nenhum chamado aberto com você" },
];

/** Uma linha de contexto ao lado da data, na saudação do topo. */
export const buildResumoDoDia = (resumo: TResumoDoDia | undefined) =>
  resumo && FRASES_DO_DIA.find((caso) => caso.isDoCaso(resumo))?.frase(resumo);

/** "2026-09-07" → "segunda-feira, 7 de setembro", para o tooltip. */
export const formatDiaPorExtenso = (data: string) => {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(ano, mes - 1, dia)
  );
};
