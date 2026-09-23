/**
 * Regras puras do painel da página inicial: janela da série, dias sem
 * movimento, mês corrente, ranking, as métricas do mês de cada papel, o resumo
 * dos sistemas da pessoa, quem pode concluir uma tarefa e o tipo de cada evento
 * da atividade. Nada aqui toca o banco (ver `painel.dao.ts`).
 *
 * O DIA é o do escritório (@utils/prazo), não o do processo: a API roda em UTC
 * e um chamado aberto às 22h ainda é do dia que termina para quem o abriu.
 */
import {
  EProjectAction,
  canOwnOrAll,
  isTransitionAllowed,
  type EffectiveRole,
  type EtapaDaTransicao,
  type TransitionRule,
} from "@utils/permissions";
import { dataLocal, inicioDeHoje, inicioDoDia } from "@utils/prazo";

/** Quantos dias cada período da série cobre, terminando hoje. */
export const PERIODOS_DA_SERIE = { semana: 7, mes: 30, trimestre: 90 } as const;

export type PeriodoDaSerie = keyof typeof PERIODOS_DA_SERIE;

export const isPeriodoDaSerie = (valor: unknown): valor is PeriodoDaSerie =>
  typeof valor === "string" && Object.hasOwn(PERIODOS_DA_SERIE, valor);

/** O período pedido na query; qualquer outra coisa vira a semana. */
export const readPeriodoDaSerie = (valor: unknown): PeriodoDaSerie => (isPeriodoDaSerie(valor) ? valor : "semana");

export type Janela = { inicio: Date; fim: Date };

export type JanelaDaSerie = Janela & { dias: string[] };

/** Os N dias que terminam hoje: da meia-noite do primeiro até agora. */
export function resolveJanelaDaSerie(periodo: PeriodoDaSerie, agora: Date): JanelaDaSerie {
  const quantos = PERIODOS_DA_SERIE[periodo];
  const dias = Array.from({ length: quantos }, (_, i) => dataLocal(inicioDeHoje(i - (quantos - 1), agora)));
  return { inicio: inicioDeHoje(1 - quantos, agora), fim: agora, dias };
}

/** Do dia 1 do mês do escritório até agora. */
export function resolveMesCorrente(agora: Date): Janela {
  const [ano, mes] = dataLocal(agora).split("-").map(Number);
  return { inicio: inicioDoDia(ano!, mes!, 1), fim: agora };
}

export type ContagemPorDia = { dia: string; total: number };

export type PontoDaSerie = { data: string; abertos: number; encerrados: number };

const indexByDia = (linhas: ContagemPorDia[]) => new Map(linhas.map((l) => [l.dia, l.total]));

/** Um ponto por dia da janela; dia sem movimento sai com zero, dia de fora some. */
export function fillSerie(dias: string[], abertos: ContagemPorDia[], encerrados: ContagemPorDia[]): PontoDaSerie[] {
  const porDiaAbertos = indexByDia(abertos);
  const porDiaEncerrados = indexByDia(encerrados);
  return dias.map((data) => ({
    data,
    abertos: porDiaAbertos.get(data) ?? 0,
    encerrados: porDiaEncerrados.get(data) ?? 0,
  }));
}

export type ContagemPorPessoa = { pessoaId: string; total: number };

export type PosicaoNoRanking = { posicao: number | null; total_pessoas: number };

/**
 * Posição de quem pergunta entre as pessoas que fizeram algo no mês (encerraram
 * ou movimentaram, conforme o perfil). Empate divide a posição (1, 2, 2, 4);
 * quem não fez nada fica sem posição.
 */
export function rankPosicao(contagens: ContagemPorPessoa[], pessoaId: string): PosicaoNoRanking {
  const comEncerrados = contagens.filter((c) => c.total > 0);
  const minha = comEncerrados.find((c) => c.pessoaId === pessoaId);
  const total_pessoas = comEncerrados.length;
  if (!minha) return { posicao: null, total_pessoas };
  return { posicao: 1 + comEncerrados.filter((c) => c.total > minha.total).length, total_pessoas };
}

export const TIPOS_DE_EVENTO = ["abertura", "etapa", "conclusao", "comentario", "solicitacao_atendida"] as const;

export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number];

type LinhaDaTrilha = { field: string | null; verb: string };

/** Por campo da trilha: o que ele vira no painel. O grupo decide se a etapa é a conclusão. */
const TIPO_POR_CAMPO: Record<string, (linha: LinhaDaTrilha, grupoDaEtapa: string | null) => TipoDeEvento | null> = {
  issue: (linha) => (linha.verb === "created" ? "abertura" : null),
  state: (_, grupo) => (grupo === "completed" ? "conclusao" : "etapa"),
  solicitacao_atendida: () => "solicitacao_atendida",
};

/** Campos da trilha que o painel lê; o resto (prioridade, etiquetas...) fica no chamado. */
export const CAMPOS_DA_ATIVIDADE = Object.keys(TIPO_POR_CAMPO);

export function classifyAtividade(linha: LinhaDaTrilha, grupoDaEtapa: string | null): TipoDeEvento | null {
  const strategy = linha.field && Object.hasOwn(TIPO_POR_CAMPO, linha.field) ? TIPO_POR_CAMPO[linha.field] : undefined;
  return strategy?.(linha, grupoDaEtapa) ?? null;
}

/** Junta as fontes (trilha e comentários) do mais novo para o mais antigo. */
export function mergeEventos<T extends { criado_em: string }>(fontes: T[][], limite: number): T[] {
  return fontes
    .flat()
    .toSorted((a, b) => b.criado_em.localeCompare(a.criado_em))
    .slice(0, limite);
}

export type SistemaDaPessoa = { id: string; name: string; identifier: string };

export type ResumoDosSistemas = { texto: string | null; etiquetas: SistemaDaPessoa[]; restantes: number };

const MAXIMO_DE_SISTEMAS_LISTADOS = 8;
const ETIQUETAS_DE_SISTEMA = 6;

/** Um vínculo por sistema: o banco aceita o mesmo vínculo repetido (a unicidade inclui `deleted_at`). */
export const uniqueSistemas = (sistemas: SistemaDaPessoa[]): SistemaDaPessoa[] => [
  ...new Map(sistemas.map((s) => [s.id, s])).values(),
];

type RegraDoResumo = {
  isDoCaso: (quantos: number, ativosNoEspaco: number) => boolean;
  build: (unicos: SistemaDaPessoa[]) => ResumoDosSistemas;
};

/** A primeira que casa decide: todos os sistemas, muitos sistemas, ou a lista curta. */
const REGRAS_DO_RESUMO: RegraDoResumo[] = [
  {
    isDoCaso: (quantos, ativos) => quantos > 0 && quantos >= ativos,
    build: (unicos) => ({ texto: `Todos os sistemas (${unicos.length})`, etiquetas: [], restantes: 0 }),
  },
  {
    isDoCaso: (quantos) => quantos > MAXIMO_DE_SISTEMAS_LISTADOS,
    build: (unicos) => ({ texto: `${unicos.length} sistemas`, etiquetas: [], restantes: 0 }),
  },
  {
    isDoCaso: () => true,
    build: (unicos) => ({
      texto: null,
      etiquetas: unicos.slice(0, ETIQUETAS_DE_SISTEMA),
      restantes: Math.max(unicos.length - ETIQUETAS_DE_SISTEMA, 0),
    }),
  },
];

/** "Sistemas em que atua": sem repetição, e resumido quando a lista não caberia no cartão. */
export function summarizeSistemas(sistemas: SistemaDaPessoa[], ativosNoEspaco: number): ResumoDosSistemas {
  const unicos = uniqueSistemas(sistemas);
  const regra = REGRAS_DO_RESUMO.find((r) => r.isDoCaso(unicos.length, ativosNoEspaco)) as RegraDoResumo;
  return regra.build(unicos);
}

/** Marcador de valor ausente no cartão de números. */
export const SEM_VALOR = "–";

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

type RegraDaDuracao = { isDaFaixa: (horas: number) => boolean; format: (horas: number) => string };

const REGRAS_DA_DURACAO: RegraDaDuracao[] = [
  { isDaFaixa: (h) => h < 1, format: () => "< 1 h" },
  { isDaFaixa: (h) => h < 48, format: (h) => `${Math.round(h)} h` },
  { isDaFaixa: () => true, format: (h) => `${DECIMAL.format(h / 24)} dias` },
];

/** Até dois dias em horas; dali em diante em dias, com uma casa. */
export function formatDuracao(horas: number | null): string {
  if (horas === null) return SEM_VALOR;
  return (REGRAS_DA_DURACAO.find((r) => r.isDaFaixa(horas)) as RegraDaDuracao).format(horas);
}

export type MetricaDoMes = { rotulo: string; valor: string; complemento: string | null };

const plural = (n: number, singular: string, varios: string) => `${n} ${n === 1 ? singular : varios}`;

const buildRanking = ({ posicao, total_pessoas }: PosicaoNoRanking, semPosicao: string): MetricaDoMes =>
  posicao === null
    ? { rotulo: "Ranking", valor: SEM_VALOR, complemento: semPosicao }
    : { rotulo: "Ranking", valor: `${posicao}º`, complemento: `de ${plural(total_pessoas, "pessoa", "pessoas")}` };

export type NumerosDeEncerramento = {
  encerrados: number;
  em_aberto: number;
  horas: number | null;
  ranking: PosicaoNoRanking;
};

export const buildMetricasDeEncerramento = (n: NumerosDeEncerramento): MetricaDoMes[] => [
  { rotulo: "Encerrados", valor: String(n.encerrados), complemento: "no mês" },
  { rotulo: "Em aberto", valor: String(n.em_aberto), complemento: "com você" },
  { rotulo: "Tempo médio", valor: formatDuracao(n.horas), complemento: "até encerrar" },
  buildRanking(n.ranking, "sem encerrados no mês"),
];

export type NumerosDeMovimentacao = {
  movimentados: number;
  comentarios: number;
  em_aberto: number;
  ranking: PosicaoNoRanking;
};

export const buildMetricasDeMovimentacao = (n: NumerosDeMovimentacao): MetricaDoMes[] => [
  { rotulo: "Movimentados", valor: String(n.movimentados), complemento: "no mês" },
  { rotulo: "Comentários", valor: String(n.comentarios), complemento: "no mês" },
  { rotulo: "Em aberto", valor: String(n.em_aberto), complemento: "com você" },
  buildRanking(n.ranking, "sem movimentações no mês"),
];

export type PerfilDeMetricas = "encerramento" | "movimentacao";

/**
 * Qualidade, Atendimento e Visualizador não encerram chamados no dia a dia: o
 * mês deles se mede pelo que movimentam (etapa mudada ou comentário). Mostrar
 * "Encerrados: 0" a quem não encerra é ruído. Função criada na tela fica com o
 * padrão, que é medir pelo que encerra.
 */
const PERFIL_POR_PAPEL: Record<string, PerfilDeMetricas> = {
  qualidade: "movimentacao",
  atendimento: "movimentacao",
  guest: "movimentacao",
};

export const readPerfilDeMetricas = (papel: string): PerfilDeMetricas =>
  Object.hasOwn(PERFIL_POR_PAPEL, papel) ? (PERFIL_POR_PAPEL[papel] as PerfilDeMetricas) : "encerramento";

export type TarefaParaConcluir = { de: EtapaDaTransicao; para: EtapaDaTransicao | null; isAutor: boolean };

/**
 * O checkbox de concluir só aparece para quem o quadro deixaria mover o chamado
 * para a etapa de conclusão: poder editar o chamado (todos ou os próprios) e a
 * transição estar liberada para a função. Mesmas regras do PATCH do chamado.
 */
export function isConcluivel(
  funcao: EffectiveRole | null,
  regras: TransitionRule[],
  tarefa: TarefaParaConcluir
): boolean {
  if (!funcao || !tarefa.para) return false;
  return (
    canOwnOrAll(funcao, tarefa.isAutor, EProjectAction.ISSUE_EDIT_OWN, EProjectAction.ISSUE_EDIT_ALL) &&
    isTransitionAllowed(funcao, regras, tarefa.de, tarefa.para)
  );
}
