/**
 * O aviso que aparece dentro da tela quando chega notificação nova. Cliente
 * parado (`data.urgente`) vem como alerta: é o que a Qualidade não pode perder.
 */

/** Como `GET /users/notifications/` devolve: o texto vem em `message_html`. */
type NotificacaoNova = { title?: string | null; message_html?: string | null; data?: { urgente?: boolean } | null };

export type AvisoNaTela = { tipo: "alerta" | "informacao"; titulo: string; mensagem: string };

export const buildAvisoNaTela = (notificacao: NotificacaoNova): AvisoNaTela => ({
  tipo: notificacao.data?.urgente ? "alerta" : "informacao",
  titulo: notificacao.title || "Novidade no chamado",
  mensagem: notificacao.message_html || "",
});
