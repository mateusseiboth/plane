/**
 * A conversa do chat como HTML para a descrição do chamado.
 *
 * O texto veio de quem escreveu no chat (inclusive o cliente, pelo WhatsApp),
 * então tudo é ESCAPADO: a descrição do chamado é renderizada como HTML no
 * editor, e um `<script>` digitado pelo cliente não pode virar marcação.
 */

export type SessaoDoChat = {
  protocol: string;
  client_name: string | null;
  client_phone: string | null;
  channel: string;
  created_at: Date;
};

export type MensagemDoChat = {
  sender: string;
  sender_name: string | null;
  type: string;
  text: string | null;
  media_key: string | null;
  media_name: string | null;
  deleted_at: Date | null;
  created_at: Date;
};

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (texto: string): string => texto.replace(/[&<>"']/g, (c) => ESCAPE[c]!);

const QUEM: Record<string, string> = { client: "Cliente", attendant: "Atendente", bot: "Robô", system: "Sistema" };
const CANAL: Record<string, string> = { whatsapp: "WhatsApp", native: "Chat do site" };

const formatHora = (d: Date) =>
  d.toLocaleString("pt-BR", { timeZone: "America/Campo_Grande", dateStyle: "short", timeStyle: "short" });

function describeConteudo(m: MensagemDoChat): string {
  if (m.deleted_at) return "<em>(mensagem apagada)</em>";
  const texto = m.text ? escapeHtml(m.text).replace(/\n/g, "<br>") : "";
  const arquivo = m.media_key ? `<em>Arquivo: ${escapeHtml(m.media_name || m.type)}</em>` : "";
  return [arquivo, texto].filter(Boolean).join("<br>");
}

function buildLinha(m: MensagemDoChat): string {
  const autor = escapeHtml(m.sender_name || QUEM[m.sender] || m.sender);
  return `<p><strong>${autor}</strong> <small>${formatHora(m.created_at)}</small><br>${describeConteudo(m)}</p>`;
}

export function buildTranscricaoHtml(
  sessao: SessaoDoChat,
  mensagens: MensagemDoChat[],
  linkDaConversa?: string | null
) {
  const cliente = escapeHtml(sessao.client_name || sessao.client_phone || "Cliente");
  const link = linkDaConversa ? ` <a href="${escapeHtml(linkDaConversa)}">Abrir a conversa</a>` : "";
  const cabecalho =
    `<p><strong>Atendimento pelo chat</strong>: protocolo ${escapeHtml(sessao.protocol)}, ` +
    `${escapeHtml(CANAL[sessao.channel] ?? sessao.channel)}, cliente ${cliente}.${link}</p>`;
  return `${cabecalho}<h3>Transcrição</h3>${mensagens.map(buildLinha).join("")}`;
}
