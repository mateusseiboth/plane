/**
 * Regras puras da lista de e-mails dos responsáveis (legado
 * `intra_responsavelemails.php`): filtros, opt-in, deduplicação e o CSV.
 *
 * Opt-in: só entra quem tem `receive_messages` ligado. É o campo que o
 * cadastro de Responsáveis já usa para "aceita receber mensagens".
 */
import type { Prisma } from "@prisma/client";
import { isEmailValido } from "@utils/email-valido";

export type FiltrosDaLista = {
  entityId: string | null;
  entityType: number | null;
  projectIds: string[];
  isWithMembers: boolean;
};

export type OrigemDoEmail = "responsavel" | "interno";

export type EmailDaLista = { email: string; name: string; entity_name: string | null; origem: OrigemDoEmail };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROTULO_DA_ORIGEM: Record<OrigemDoEmail, string> = { responsavel: "Responsável", interno: "Interno" };

export function readFiltrosDaLista(query: Record<string, unknown>): FiltrosDaLista {
  const entityId = String(query.entity_id ?? "");
  const entityType = Number.parseInt(String(query.entity_type ?? ""), 10);
  return {
    entityId: UUID.test(entityId) ? entityId : null,
    entityType: Number.isInteger(entityType) ? entityType : null,
    projectIds: String(query.project_ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => UUID.test(id)),
    isWithMembers: query.include_members === "true" || query.include_members === true,
  };
}

export function buildContatoWhere(workspaceId: string, filtros: FiltrosDaLista): Prisma.EntityContactWhereInput {
  return {
    workspaceId,
    deletedAt: null,
    isActive: true,
    receiveMessages: true,
    email: { not: null },
    ...(filtros.entityId ? { entityId: filtros.entityId } : {}),
    entity: {
      deletedAt: null,
      isActive: true,
      frozenAt: null,
      ...(filtros.entityType === null ? {} : { entityType: filtros.entityType }),
    },
    ...(filtros.projectIds.length ? { projects: { some: { projectId: { in: filtros.projectIds } } } } : {}),
  };
}

/** Primeira ocorrência de cada e-mail vence; e-mail inválido não entra na lista de disparo. */
export function mergeEmails(itens: EmailDaLista[]): EmailDaLista[] {
  const porEmail = new Map<string, EmailDaLista>();
  for (const item of itens) {
    const email = item.email.trim().toLowerCase();
    if (!isEmailValido(email) || porEmail.has(email)) continue;
    porEmail.set(email, { ...item, email });
  }
  return [...porEmail.values()].toSorted((a, b) => a.email.localeCompare(b.email));
}

const celula = (valor: string | null) => {
  const texto = valor ?? "";
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

/** Marca de ordem de bytes: sem ela o Excel abre o UTF-8 como Latin-1 e estraga os acentos. */
export const BOM = String.fromCharCode(0xfeff);

/** CSV para o Excel em pt-BR: `;` como separador e BOM para os acentos. */
export function buildEmailsCsv(itens: EmailDaLista[]): string {
  const linhas = itens.map((i) => [i.email, i.name, i.entity_name, ROTULO_DA_ORIGEM[i.origem]].map(celula).join(";"));
  return `${BOM}${["e-mail;nome;entidade;origem", ...linhas].join("\r\n")}\r\n`;
}
