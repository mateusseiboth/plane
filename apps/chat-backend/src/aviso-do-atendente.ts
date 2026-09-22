/**
 * O aviso endereçado ao ATENDENTE da conversa.
 *
 * `message.new` é entregue a quem está com a conversa aberta. Isso bastava
 * enquanto o atendente só ficava online dentro da tela do chat. Agora o sistema
 * mantém a presença aberta desde o login, a fila entrega conversa a quem está em
 * outra tela, e essa pessoa precisa de um sinal: este evento leva o nome do
 * cliente e o começo da mensagem, direto para os sockets dela.
 *
 * É um evento SEPARADO de propósito. Mandar o `message.new` inteiro para o
 * atendente entregaria o conteúdo da conversa para uma tela que não é o chat, e
 * duplicaria a mensagem para quem já está com ela aberta.
 */

export type SessaoDoAviso = {
  id: string;
  assignedAttendantId: string | null;
  clientName?: string | null;
  clientPhone?: string | null;
};

export type MensagemDoAviso = {
  sender: string;
  type: string;
  text: string | null;
};

const SEM_NOME = "Visitante";

/** Como chamar o cliente na tela de quem atende. */
export function nomeDoCliente(sessao: Pick<SessaoDoAviso, "clientName" | "clientPhone">): string {
  return sessao.clientName || sessao.clientPhone || SEM_NOME;
}

/** Um rótulo por tipo de mensagem: anexo não tem texto para mostrar. */
const RESUMO_POR_TIPO: Record<string, string> = {
  image: "📷 Imagem",
  video: "🎬 Vídeo",
  audio: "🎤 Áudio",
  file: "📎 Arquivo",
};

export function resumoDaMensagem(mensagem: Pick<MensagemDoAviso, "type" | "text">): string {
  return mensagem.text || RESUMO_POR_TIPO[mensagem.type] || "Nova mensagem";
}

export type AvisoDoAtendente = {
  userId: string;
  payload: { type: "session.client_message"; session_id: string; client_name: string; preview: string };
};

/**
 * Nada a avisar quando a conversa ainda está com o robô ou na fila (sem dono),
 * nem quando quem escreveu foi o próprio atendente.
 */
export function avisoDeMensagemDoCliente(sessao: SessaoDoAviso, mensagem: MensagemDoAviso): AvisoDoAtendente | null {
  if (mensagem.sender !== "client") return null;
  if (!sessao.assignedAttendantId) return null;
  return {
    userId: sessao.assignedAttendantId,
    payload: {
      type: "session.client_message",
      session_id: sessao.id,
      client_name: nomeDoCliente(sessao),
      preview: resumoDaMensagem(mensagem),
    },
  };
}
