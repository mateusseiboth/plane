/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras da presença do atendente.
 *
 * O chat considera atendente online quem tem um WebSocket vivo no servidor. Até
 * aqui esse socket só nascia dentro da tela do chat: quem não abria a tela ficava
 * offline o dia inteiro e a fila nunca entregava atendimento para ele. A presença
 * passou a ser do sistema inteiro, e este arquivo guarda as decisões dela, todas
 * puras, para poderem ser testadas sem navegador.
 */

export type EstadoDaPresenca = {
  /** Espaço de trabalho aberto agora. Sem ele não há a quem se conectar. */
  slug: string | undefined;
  /** `enabled` da configuração do chat no espaço. */
  chatHabilitado: boolean;
  /** A pessoa tem papel que atende (mesma pergunta do `ehAtendente` do servidor). */
  podeAtender: boolean;
};

/** Manter a presença aberta só faz sentido para quem realmente vai atender. */
export function shouldConnectPresenca(estado: EstadoDaPresenca): boolean {
  if (!estado.slug) return false;
  if (!estado.chatHabilitado) return false;
  return estado.podeAtender;
}

/**
 * Espera entre as tentativas de reconexão.
 *
 * Reconectar de 3 em 3 segundos para sempre, como era antes, multiplica a
 * enxurrada quando o servidor do chat cai: são todos os navegadores da empresa
 * batendo na porta ao mesmo tempo. Dobrando até o teto, a primeira queda continua
 * se resolvendo em segundos e a queda longa não vira ataque ao próprio servidor.
 */
export const RECONEXAO = { inicialMs: 2000, tetoMs: 30000 } as const;

export function delayDaReconexao(tentativa: number): number {
  const numero = Math.max(1, Math.floor(tentativa));
  return Math.min(RECONEXAO.tetoMs, RECONEXAO.inicialMs * 2 ** (numero - 1));
}

/**
 * A pessoa está na tela do atendente deste espaço?
 *
 * A comparação é por segmento: `/quality/chat-view/...` é a transcrição somente
 * leitura, não a tela que já mostra o atendimento chegando, então lá o aviso
 * continua valendo.
 */
export function isTelaDoChat(pathname: string | null | undefined, slug: string): boolean {
  if (!pathname || !slug) return false;
  const partes = pathname.split("/").filter(Boolean);
  return partes[0] === slug && partes[1] === "chat";
}

export type EventoDoChat = {
  type: string;
  session_id?: string;
  client_name?: string | null;
  preview?: string | null;
};

export type ContextoDoAviso = {
  /** Na tela do chat quem avisa é a própria tela; dois avisos do mesmo fato irritam. */
  naTelaDoChat: boolean;
};

export type AvisoDeAtendimento = {
  /** Identifica o aviso para não empilhar o mesmo várias vezes. */
  chave: string;
  titulo: string;
  corpo: string;
};

const SEM_NOME = "Visitante";
const CHAMADO_A_AGIR = "Abra o chat para responder.";

/**
 * Um texto por tipo de evento.
 *
 * Mapa em vez de cadeia de `if`: evento novo é uma linha aqui, e o que não está
 * no mapa simplesmente não vira aviso.
 */
const TEXTO_DO_EVENTO: Record<string, (evento: EventoDoChat, nome: string) => { titulo: string; corpo: string }> = {
  "session.assigned": (_evento, nome) => ({ titulo: `Novo atendimento de ${nome}.`, corpo: CHAMADO_A_AGIR }),
  "session.transferred": (_evento, nome) => ({
    titulo: `Atendimento de ${nome} transferido para você.`,
    corpo: CHAMADO_A_AGIR,
  }),
  "session.client_message": (evento, nome) => ({
    titulo: `Nova mensagem de ${nome}.`,
    corpo: evento.preview || CHAMADO_A_AGIR,
  }),
};

export function avisoDoEvento(evento: EventoDoChat, contexto: ContextoDoAviso): AvisoDeAtendimento | null {
  if (contexto.naTelaDoChat) return null;
  const texto = TEXTO_DO_EVENTO[evento.type];
  if (!texto) return null;
  const { titulo, corpo } = texto(evento, evento.client_name || SEM_NOME);
  return { chave: `${evento.type}:${evento.session_id ?? ""}`, titulo, corpo };
}
