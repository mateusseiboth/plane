/**
 * Quem escreve numa conversa: só o atendente dono dela.
 *
 * `chat.ver_todas` abre a conversa dos outros para LEITURA (gestão, auditoria).
 * Antes, quem a abria também respondia, e a mensagem saía para o cliente como
 * se o atendimento tivesse trocado de mãos sem transferência. Para assumir a
 * conversa de outra pessoa o caminho é a transferência, que deixa o rastro.
 *
 * Conversa sem dono (fila, robô) continua aceitando resposta de quem a enxerga.
 */

type SessaoComDono = { assignedAttendantId: string | null };

export const SO_O_DONO_ESCREVE = "Esta conversa é de outro atendente. Você pode ler, mas não responder.";

export const isConversaDeOutroAtendente = (sessao: SessaoComDono, userId: string): boolean =>
  sessao.assignedAttendantId !== null && sessao.assignedAttendantId !== userId;
