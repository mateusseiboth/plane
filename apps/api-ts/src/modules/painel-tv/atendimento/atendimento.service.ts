/**
 * Painel de TV do atendimento: os dados são do CHAT, então o api-ts só
 * atravessa o pedido.
 *
 * Por que passar por aqui, e não a TV falar direto com o chat: a chave do
 * painel é do api-ts, e a regra dela precisa existir em um lugar só. A TV
 * conversa com uma origem só (`/api/v1/tv/...`), e o chat confere apenas o
 * segredo de serviço que os dois já compartilham (`CHAT_SERVICE_TOKEN`).
 */

import { CHAT_INTERNAL_URL } from "@modules/chat-chamado/anexos";
import { PainelError } from "@modules/painel-tv/chaves/chave.errors";
import { readServiceToken, SERVICE_TOKEN_HEADER } from "@utils/servico-interno";

const TIMEOUT_MS = 8_000;

export class PainelDoChatIndisponivelError extends PainelError {
  constructor() {
    super("O painel do atendimento está indisponível. Tente em instantes.", 503);
  }
}

type Opcoes = { chatUrl?: string; token?: string | undefined; buscar?: typeof fetch };

export async function findPainelDeAtendimento(slug: string, opcoes: Opcoes = {}) {
  const { chatUrl = CHAT_INTERNAL_URL, token = readServiceToken(), buscar = fetch } = opcoes;
  if (!token) throw new PainelDoChatIndisponivelError();

  const resposta = await buscar(`${chatUrl}/internal/painel/${encodeURIComponent(slug)}/atendimento/`, {
    headers: { [SERVICE_TOKEN_HEADER]: token },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch(() => null);

  if (!resposta?.ok) throw new PainelDoChatIndisponivelError();
  return resposta.json();
}
