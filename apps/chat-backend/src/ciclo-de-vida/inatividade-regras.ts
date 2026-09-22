/**
 * Inatividade na conversa em andamento (`zapi/buscaCliAbandonouResp.php` e
 * `zapi/menuRetomarAtendimento.php` do SAC): o atendente escreveu, o cliente
 * sumiu por 10 minutos, o robô pergunta se continua (1) ou encerra (99).
 */

export const PRAZO_DE_INATIVIDADE_MS = 10 * 60 * 1000;

export const RESPOSTA_DE_INATIVIDADE = {
  CONTINUAR: "continuar",
  ENCERRAR: "encerrar",
  INVALIDA: "invalida",
} as const;
export type RespostaDeInatividade = (typeof RESPOSTA_DE_INATIVIDADE)[keyof typeof RESPOSTA_DE_INATIVIDADE];

const RESPOSTA_POR_TEXTO: Record<string, RespostaDeInatividade> = {
  "1": RESPOSTA_DE_INATIVIDADE.CONTINUAR,
  "99": RESPOSTA_DE_INATIVIDADE.ENCERRAR,
};

/** Aceita "*1*", " 99 " e afins: o cliente copia o negrito da pergunta. */
export const parseRespostaDeInatividade = (texto: string): RespostaDeInatividade =>
  RESPOSTA_POR_TEXTO[texto.replace(/[^\d]/g, "")] ?? RESPOSTA_DE_INATIVIDADE.INVALIDA;

type Marcas = { lastAttendantMessageAt: Date | null; lastClientMessageAt: Date | null };

/** A última palavra é do atendente, e já faz mais de 10 minutos. */
export function isAguardandoCliente(s: Marcas, agora: number): boolean {
  if (!s.lastAttendantMessageAt) return false;
  const atendente = s.lastAttendantMessageAt.getTime();
  if ((s.lastClientMessageAt?.getTime() ?? 0) > atendente) return false;
  return agora - atendente > PRAZO_DE_INATIVIDADE_MS;
}

/** Perguntou e o cliente não respondeu em mais 10 minutos. */
export function isPerguntaVencida(
  s: { idlePromptedAt: Date | null; lastClientMessageAt: Date | null },
  agora: number
): boolean {
  if (!s.idlePromptedAt) return false;
  const pergunta = s.idlePromptedAt.getTime();
  if ((s.lastClientMessageAt?.getTime() ?? 0) > pergunta) return false;
  return agora - pergunta > PRAZO_DE_INATIVIDADE_MS;
}
