/**
 * O texto que vai ao WhatsApp para uma mensagem já gravada. O WhatsApp não tem
 * rótulo de remetente, então o nome do atendente vai em negrito no começo, a
 * menos que ele tenha pedido para enviar sem o nome. O corpo depende do tipo
 * (strategy map): tipo novo, uma linha.
 */

import { TIPO_CHAVE } from "@/atendente/chave";

const CORPO_POR_TIPO: Record<string, (texto: string) => string> = {
  [TIPO_CHAVE]: (chave) => `Chave de acesso remoto: *${chave}*`,
};

const asIs = (texto: string) => texto;

export function formatTextoDoWhatsapp(m: { type: string; text: string | null; nome: string | null }): string | null {
  if (!m.text) return null;
  const corpo = (CORPO_POR_TIPO[m.type] ?? asIs)(m.text);
  return m.nome ? `*${m.nome}*:\n${corpo}` : corpo;
}
