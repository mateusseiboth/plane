// Regras do cadastro de entidade: quais campos o corpo pode trazer, como cada
// um é validado e como a entidade sai para a tela.

import prisma from "@db";
import { createFieldError } from "@utils/field-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENTITY_INCLUDE = {
  representative: { select: { id: true, displayName: true } },
  relatedEntity: { select: { id: true, name: true, cnpj: true } },
} as const;

function iso(value: Date | null | undefined) {
  return value?.toISOString?.() ?? null;
}

/**
 * O restante da API responde em snake_case (é o que o frontend `TEntity`
 * consome); devolver o objeto do Prisma cru faria `entity_type`/`is_active`
 * chegarem como `undefined` na tela.
 */
export function entityDto(e: any) {
  return {
    id: e.id,
    name: e.name,
    entity_type: e.entityType ?? null,
    cnpj: e.cnpj ?? null,
    // Com CNPJ de terceiro, o que vale para nota e cadastro é o da entidade responsável.
    effective_cnpj: e.usesThirdPartyCnpj ? (e.relatedEntity?.cnpj ?? null) : (e.cnpj ?? null),
    street: e.street ?? null,
    address_number: e.addressNumber ?? null,
    complement: e.complement ?? null,
    district: e.district ?? null,
    zip_code: e.zipCode ?? null,
    city: e.city ?? null,
    state: e.state ?? null,
    email: e.email ?? null,
    phone: e.phone ?? null,
    fax: e.fax ?? null,
    state_registration: e.stateRegistration ?? null,
    website: e.website ?? null,
    representative_id: e.representativeId ?? null,
    representative_name: e.representative?.displayName ?? null,
    related_entity_id: e.relatedEntityId ?? null,
    related_entity_name: e.relatedEntity?.name ?? null,
    uses_third_party_cnpj: e.usesThirdPartyCnpj ?? false,
    is_active: e.isActive,
    is_frozen: Boolean(e.frozenAt),
    frozen_at: iso(e.frozenAt),
    frozen_reason: e.frozenReason ?? null,
    legacy_id: e.legacyId ?? null,
    external_source: e.externalSource ?? null,
    external_id: e.externalId ?? null,
    workspace_id: e.workspaceId,
    created_at: iso(e.createdAt),
    updated_at: iso(e.updatedAt),
  };
}

export async function findEntityDto(workspaceId: string, entityId: string) {
  const entity = await prisma.entity.findFirst({
    where: { id: entityId, workspaceId, deletedAt: null },
    include: ENTITY_INCLUDE,
  });
  if (!entity) throw { status: 404, message: "Entidade não encontrada." };
  return entityDto(entity);
}

function readOptionalText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function readZipCode(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length !== 8) throw createFieldError("zip_code", "Informe o CEP com 8 dígitos.");
  return digits;
}

function readUuid(path: string, value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!UUID_RE.test(text)) throw createFieldError(path, "Seleção inválida.");
  return text;
}

// Campos de texto livre: entrada da API -> coluna.
const TEXT_FIELDS: Record<string, string> = {
  name: "name",
  cnpj: "cnpj",
  street: "street",
  address_number: "addressNumber",
  complement: "complement",
  district: "district",
  city: "city",
  state: "state",
  email: "email",
  phone: "phone",
  fax: "fax",
  state_registration: "stateRegistration",
  website: "website",
  external_source: "externalSource",
  external_id: "externalId",
};

// Campos com regra própria.
const PARSED_FIELDS: Record<string, [string, (value: unknown) => unknown]> = {
  zip_code: ["zipCode", readZipCode],
  representative_id: ["representativeId", (v) => readUuid("representative_id", v)],
  related_entity_id: ["relatedEntityId", (v) => readUuid("related_entity_id", v)],
  entity_type: ["entityType", (v) => v ?? null],
  is_active: ["isActive", (v) => Boolean(v)],
  uses_third_party_cnpj: ["usesThirdPartyCnpj", (v) => Boolean(v)],
  legacy_id: ["legacyId", (v) => v ?? null],
};

/** Só transporta o que o corpo trouxe: no PATCH, campo ausente é campo intocado. */
export function readEntityData(body: any): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [input, column] of Object.entries(TEXT_FIELDS)) {
    if (body[input] !== undefined) data[column] = readOptionalText(body[input]);
  }
  for (const [input, [column, parse]] of Object.entries(PARSED_FIELDS)) {
    if (body[input] !== undefined) data[column] = parse(body[input]);
  }
  return data;
}

async function requireRepresentative(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findFirst({
    where: { workspaceId, memberId: userId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!member) throw createFieldError("representative_id", "O representante precisa ser membro do espaço.");
}

async function requireRelatedEntity(workspaceId: string, relatedId: string, selfId: string | null) {
  if (relatedId === selfId) {
    throw createFieldError("related_entity_id", "A entidade não pode ser responsável por ela mesma.");
  }
  const related = await prisma.entity.findFirst({
    where: { id: relatedId, workspaceId, deletedAt: null },
    select: { relatedEntityId: true },
  });
  if (!related) throw createFieldError("related_entity_id", "Entidade responsável inválida.");
  if (selfId && related.relatedEntityId === selfId) {
    throw createFieldError("related_entity_id", "Esta entidade já é a responsável pela entidade escolhida.");
  }
}

type EntityState = { id: string | null; relatedEntityId: string | null; usesThirdPartyCnpj: boolean };

/** Regras que dependem do banco ou do estado final (corpo + registro atual). */
export async function requireValidEntityData(workspaceId: string, data: Record<string, any>, current: EntityState) {
  if (data.representativeId) await requireRepresentative(workspaceId, data.representativeId);
  if (data.relatedEntityId) await requireRelatedEntity(workspaceId, data.relatedEntityId, current.id);
  const relatedEntityId = data.relatedEntityId !== undefined ? data.relatedEntityId : current.relatedEntityId;
  const usesThirdParty = data.usesThirdPartyCnpj ?? current.usesThirdPartyCnpj;
  if (usesThirdParty && !relatedEntityId) {
    throw createFieldError("related_entity_id", "Informe a entidade responsável pelo CNPJ.");
  }
}
