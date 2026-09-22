/**
 * Pausa do chat do site (`popChatAt_pausachat.php` + regra 12 do
 * `sac_chat_regrasupdate.php`): o atendente pausa porque o cliente precisa de
 * tempo; se ele não voltar em 3 dias, é abandono do tipo 4.
 */

export const PRAZO_DA_PAUSA_MS = 3 * 24 * 60 * 60 * 1000;

export function isPausaVencida(s: { pausedAt: Date | null; lastClientMessageAt: Date | null }, agora: number): boolean {
  if (!s.pausedAt) return false;
  const referencia = Math.max(s.pausedAt.getTime(), s.lastClientMessageAt?.getTime() ?? 0);
  return agora - referencia > PRAZO_DA_PAUSA_MS;
}
