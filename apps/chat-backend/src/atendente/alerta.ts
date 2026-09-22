/**
 * Alerta de cliente sem resposta (SLA): o cliente escreveu por último e está
 * esperando o atendente há mais de 10 minutos.
 *
 * O atendente pode pausar o alerta de uma conversa (o cliente disse "vou
 * verificar e já volto"). A pausa vence sozinha em 40 minutos, como no SAC
 * (`popChatAt_pausar_alerta_semresp.php` + a limpeza em
 * `popChatAt_clientes_semresp.php`): esquecer uma pausa ligada deixaria o
 * cliente sem cobrança para sempre.
 */

export const ESPERA_PARA_ALERTAR_MS = 10 * 60 * 1000;
export const PAUSA_DO_ALERTA_MS = 40 * 60 * 1000;

type SessaoDoAlerta = {
  lastClientMessageAt: Date | null;
  lastAttendantMessageAt: Date | null;
  slaAlertPausedAt: Date | null;
};

/** Fim da pausa ainda em vigor, ou nulo quando não há pausa valendo. */
export function readAlertaPausadoAte(pausadoEm: Date | null, agora: Date): Date | null {
  if (!pausadoEm) return null;
  const ate = new Date(pausadoEm.getTime() + PAUSA_DO_ALERTA_MS);
  return ate.getTime() > agora.getTime() ? ate : null;
}

const isAguardandoAtendente = (s: SessaoDoAlerta, agora: Date): boolean => {
  if (!s.lastClientMessageAt) return false;
  const cliente = s.lastClientMessageAt.getTime();
  const atendente = s.lastAttendantMessageAt?.getTime() ?? 0;
  return cliente > atendente && agora.getTime() - cliente > ESPERA_PARA_ALERTAR_MS;
};

export const shouldAlertSla = (s: SessaoDoAlerta, agora: Date): boolean =>
  isAguardandoAtendente(s, agora) && !readAlertaPausadoAte(s.slaAlertPausedAt, agora);
