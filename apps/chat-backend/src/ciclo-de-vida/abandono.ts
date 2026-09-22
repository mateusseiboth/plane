/**
 * Como a conversa terminou e, quando o cliente a deixou, qual dos cinco tipos de
 * abandono do SAC (`sac_chat_regrasupdate.php`) ela é.
 *
 * Os números são os do legado, de propósito: os relatórios antigos e os novos
 * falam do mesmo "tipo 3". Só regra pura, sem banco.
 */

export const TIPO_ABANDONO = {
  DURANTE_A_CONVERSA: 1,
  ANTES_DE_INICIAR: 2,
  NA_FILA: 3,
  NAO_VOLTOU_DA_PAUSA: 4,
  INATIVIDADE: 5,
} as const;
export type TipoAbandono = (typeof TIPO_ABANDONO)[keyof typeof TIPO_ABANDONO];

const ROTULO: Record<TipoAbandono, string> = {
  1: "Durante a conversa",
  2: "Antes de iniciar",
  3: "Na fila de espera",
  4: "Não voltou da pausa",
  5: "Inatividade",
};

export const rotuloDoAbandono = (tipo: number | null | undefined): string =>
  ROTULO[tipo as TipoAbandono] ?? "Não informado";

/** O que provocou o fim. Vira `chat_sessions.end_kind`. */
export const CAUSA_DO_FIM = {
  ATENDENTE: "atendente",
  CLIENTE_ENCERROU: "cliente",
  CLIENTE_SAIU: "cliente_saiu",
  INATIVIDADE: "inatividade",
  PAUSA_VENCIDA: "pausa_vencida",
  FIM_DO_DIA: "fim_do_dia",
  ROBO: "robo",
} as const;
export type CausaDoFim = (typeof CAUSA_DO_FIM)[keyof typeof CAUSA_DO_FIM];

export type SituacaoNoFim = { status: string; hasAttendantMessage: boolean };

type Classificador = (situacao: SituacaoNoFim) => TipoAbandono | null;

const AINDA_SEM_ATENDENTE = new Set(["bot", "queued"]);

/** Cliente que foi embora (fechou o chat ou ficou em silêncio). */
const classifySaida =
  (emConversa: TipoAbandono): Classificador =>
  (situacao) => {
    if (AINDA_SEM_ATENDENTE.has(situacao.status)) return TIPO_ABANDONO.NA_FILA;
    if (!situacao.hasAttendantMessage) return TIPO_ABANDONO.ANTES_DE_INICIAR;
    return emConversa;
  };

const NAO_E_ABANDONO: Classificador = () => null;

const CLASSIFICADOR_POR_CAUSA: Record<CausaDoFim, Classificador> = {
  atendente: NAO_E_ABANDONO,
  cliente: NAO_E_ABANDONO,
  fim_do_dia: NAO_E_ABANDONO,
  robo: NAO_E_ABANDONO,
  cliente_saiu: classifySaida(TIPO_ABANDONO.DURANTE_A_CONVERSA),
  inatividade: classifySaida(TIPO_ABANDONO.INATIVIDADE),
  pausa_vencida: () => TIPO_ABANDONO.NAO_VOLTOU_DA_PAUSA,
};

export const classifyAbandono = (causa: CausaDoFim, situacao: SituacaoNoFim): TipoAbandono | null =>
  CLASSIFICADOR_POR_CAUSA[causa](situacao);

/** `end_kind` "abandono" é o histórico do SAC, que não trouxe o tipo. */
export const isAbandonado = (s: { abandonType?: number | null; endKind?: string | null }): boolean =>
  s.abandonType != null || s.endKind === "abandono";
