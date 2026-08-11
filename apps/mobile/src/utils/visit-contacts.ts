/**
 * Responsáveis (quem recebeu a equipe) de uma visita técnica — no cadastro eles
 * se chamam Contatos; "responsável" é o papel que exercem na visita.
 *
 * O vínculo real são registros do cadastro de Contatos da entidade:
 * a visita envia `contact_ids` e recebe `contact_records`. O campo texto
 * `TechnicalVisit.contacts` continua existindo — é o que veio do SAC, nomes
 * soltos que não dá para reconstituir em pessoas — e por isso estes helpers só
 * o leem: nada aqui reescreve aquela string.
 */
import { EntityContact, EntityContactDraft, TechnicalVisit } from "@/api";

/** Campo em branco é ausência de dado, não string vazia — o servidor guarda nulo. */
export function normalizeContactDraft(draft: EntityContactDraft): EntityContactDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    phone: draft.phone?.trim() || null,
    email: draft.email?.trim() || null,
  };
}

/** Quebra o texto histórico do SAC em linhas legíveis. Somente exibição. */
export function parseContacts(raw?: string | null): string[] {
  if (!raw) return [];
  return raw.split(",").map((name) => name.trim()).filter(Boolean);
}

/** Ids já vinculados à visita — base para adicionar ou remover um responsável. */
export function contactIdsOf(visit?: TechnicalVisit | null): string[] {
  return (visit?.contact_records ?? []).map((c) => c.id);
}

/** Linha de apoio na lista: tipo, telefone e e-mail, sem separadores órfãos. */
export function contactSubtitle(contact: EntityContact): string {
  return [contact.type_name, contact.phone, contact.email].filter(Boolean).join(" · ");
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Busca local sobre a lista já carregada da entidade. Telefone casa por dígitos:
 * quem digita "(67) 99999-0000" precisa achar o registro guardado com DDI.
 */
export function matchesContact(contact: EntityContact, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const text = [contact.name, contact.email, contact.type_name].filter(Boolean).join(" ").toLowerCase();
  if (text.includes(term)) return true;
  const digits = onlyDigits(term);
  if (!digits) return false;
  return [contact.phone_digits, contact.phone].some((p) => !!p && onlyDigits(p).includes(digits));
}
