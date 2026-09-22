/**
 * Chave de acesso remoto enviada ao cliente (AnyDesk, TeamViewer). É uma
 * mensagem de tipo próprio (`chave`): o WhatsApp recebe a chave em negrito e o
 * widget do site mostra um botão de copiar. Legado: `popChatAt_enviachave.php`
 * e `popChatAt_posta_chave.php`.
 */

import { asCorpo, erro, readText, type Resultado } from "@/ligacoes/payload";

export const TIPO_CHAVE = "chave";

const LIMITE_DA_CHAVE = 200;

export function parseChave(body: unknown): Resultado<string> {
  const chave = readText(asCorpo(body).chave, LIMITE_DA_CHAVE);
  if (!chave) return { ok: false, errors: [erro("chave", "Informe a chave de acesso.")] };
  return { ok: true, data: chave };
}
