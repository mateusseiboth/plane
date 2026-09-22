/**
 * Regras puras da ouvidoria: catálogo de tipos, validação do registro que o
 * robô envia e os filtros da tela. Nada aqui toca o banco.
 */
import type { Prisma } from "@prisma/client";
import type { FieldErrorItem } from "@utils/field-error";

export const OUVIDORIA_KIND = { SUGESTAO: "sugestao", RECLAMACAO: "reclamacao" } as const;
export type OuvidoriaKind = (typeof OUVIDORIA_KIND)[keyof typeof OUVIDORIA_KIND];

export const OUVIDORIA_KIND_LABEL: Record<OuvidoriaKind, string> = {
  sugestao: "Sugestão",
  reclamacao: "Reclamação",
};

export const isOuvidoriaKind = (valor: unknown): valor is OuvidoriaKind =>
  typeof valor === "string" && Object.hasOwn(OUVIDORIA_KIND_LABEL, valor);

export const onlyDigitos = (valor: unknown): string => String(valor ?? "").replace(/\D/g, "");

const NOME_MAXIMO = 120;
const MENSAGEM_MAXIMA = 4000;

export type OuvidoriaData = {
  kind: OuvidoriaKind;
  cnpj: string;
  name: string;
  message: string;
  phone: string | null;
  chatSessionId: string | null;
  protocol: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (valor: unknown) => (typeof valor === "string" ? valor.trim() : "");
const optionalText = (valor: unknown, max: number) => text(valor).slice(0, max) || null;

type Check = [path: string, isInvalid: (body: Record<string, unknown>) => boolean, message: string];

const CHECKS: Check[] = [
  ["kind", (b) => !isOuvidoriaKind(b.kind), "Escolha sugestão ou reclamação."],
  ["cnpj", (b) => onlyDigitos(b.cnpj).length !== 14, "Informe o CNPJ com 14 números."],
  ["name", (b) => !text(b.name), "Informe o nome."],
  ["message", (b) => !text(b.message), "Escreva a mensagem."],
];

export function validateOuvidoriaInput(body: Record<string, unknown>): {
  data: OuvidoriaData;
  errors: FieldErrorItem[];
} {
  const errors = CHECKS.filter(([, isInvalid]) => isInvalid(body)).map(([path, , message]) => ({ path, message }));
  const sessao = text(body.chat_session_id);
  return {
    errors,
    data: {
      kind: body.kind as OuvidoriaKind,
      cnpj: onlyDigitos(body.cnpj),
      name: text(body.name).slice(0, NOME_MAXIMO),
      message: text(body.message).slice(0, MENSAGEM_MAXIMA),
      phone: optionalText(body.phone, 30),
      chatSessionId: UUID.test(sessao) ? sessao : null,
      protocol: optionalText(body.protocol, 30),
    },
  };
}

/** "true"/"false" da query → filtro de lida; qualquer outra coisa não filtra. */
const FILTRO_DE_LIDA: Record<string, Prisma.OuvidoriaWhereInput> = {
  true: { readAt: { not: null } },
  false: { readAt: null },
};

export function buildOuvidoriaWhere(workspaceId: string, query: Record<string, unknown>): Prisma.OuvidoriaWhereInput {
  return {
    workspaceId,
    ...(isOuvidoriaKind(query.kind) ? { kind: query.kind } : {}),
    ...FILTRO_DE_LIDA[String(query.read)],
  };
}
