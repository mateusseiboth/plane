/**
 * Canais de atendimento que o chat conhece e o filtro da lista por canal.
 *
 * A ligação do PBX é uma `ChatSession` com `channel = "phone"`: entra na caixa,
 * no protocolo e no histórico como qualquer conversa. Mas do outro lado não há
 * ninguém digitando, então tudo que mede ou cobra resposta escrita (SLA,
 * inatividade, fila automática) precisa deixá-la de fora com `WITHOUT_PHONE`.
 */

export const CHANNELS = { WHATSAPP: "whatsapp", NATIVE: "native", PHONE: "phone" } as const;
export type Channel = (typeof CHANNELS)[keyof typeof CHANNELS];

export const PHONE_CHANNEL = CHANNELS.PHONE;

/** Pedaço de `where` do Prisma para consultas que não valem para ligação. */
export const WITHOUT_PHONE = { channel: { not: PHONE_CHANNEL } } as const;

const KNOWN_CHANNELS = new Set<string>(Object.values(CHANNELS));

export const isPhoneSession = (s: { channel: string }): boolean => s.channel === PHONE_CHANNEL;

/**
 * `?channel=phone` ou `?channel=whatsapp,native`. Canal desconhecido é
 * ignorado; sobrando nada, não filtra.
 */
export function parseChannelFilter(raw: unknown): { channel?: { in: string[] } } {
  const canais = String(raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => KNOWN_CHANNELS.has(c));
  return canais.length ? { channel: { in: canais } } : {};
}
