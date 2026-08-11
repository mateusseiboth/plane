import Elysia from "elysia";
import {authPlugin} from "@middleware/auth";
import prisma from "@db";
import {AUDIT_ACTIONS, AUDIT_ENTITIES, auditDiff, recordAudit} from "@utils/audit";
import {paginate} from "@utils/pagination";
import {getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import {requireWorkspaceAction} from "@utils/permission-checks";
import {EProjectAction} from "@utils/permissions";

// Ler é de todo mundo: o menu Contatos é visível para o espaço inteiro.
// Escrever pede INTAKE_CREATE — a permissão de quem abre chamado. Ela cobre
// Atendimento, Qualidade, TI, Gestor e Administrador (é quem cadastra ao
// encerrar um atendimento ou em cima de uma visita técnica) e deixa de fora o
// Visualizador. Contato é dado pessoal de terceiro; a trilha LGPD logo abaixo
// só serve para alguma coisa se houver a quem responsabilizar.
const exigirEscrita = (workspaceId: string, userId: string) =>
  requireWorkspaceAction(workspaceId, userId, EProjectAction.INTAKE_CREATE);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INCLUDE_CONTATO = {
  entity: {select: {id: true, name: true}},
  type: {select: {id: true, name: true, isSystemUser: true}},
} as const;

function iso(valor: any) {
  if (!valor) return null;
  return valor instanceof Date ? valor.toISOString() : String(valor);
}

/** `birth_date` é só a data no banco (`@db.Date`); devolver o instante inteiro confundiria o cliente. */
function isoData(valor: any) {
  return iso(valor)?.slice(0, 10) ?? null;
}

function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

/**
 * O chat casa a conversa do WhatsApp por este campo, então ele precisa do DDI.
 * Número brasileiro chega sem o 55 (10 dígitos no fixo, 11 no celular) e é aqui
 * que ele é acrescentado — o cliente nunca envia `phone_digits`.
 */
export function derivarPhoneDigits(phone: unknown): string | null {
  const digitos = somenteDigitos(typeof phone === "string" ? phone : "");
  if (!digitos) return null;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

/** Parte nacional do número: sem o 55, quando o que sobra ainda faz sentido. */
function semDdi(digitos: string) {
  const cortado = digitos.startsWith("55") ? digitos.slice(2) : digitos;
  return cortado.length === 10 || cortado.length === 11 ? cortado : digitos;
}

/**
 * O telefone é a chave que o chat usa para reconhecer quem chegou pelo
 * WhatsApp: guardar lixo aqui faz o cliente virar um desconhecido a cada
 * conversa. O SAC aceitava texto livre e recebeu de tudo — a partir daqui,
 * não. Vale para todo mundo que escreve (tela, chat, mobile, script), não só
 * para o formulário. Vazio continua válido: o campo é opcional.
 *
 * As duas regras finas (nono dígito, DDD sem zero) só valem para número NOVO.
 * A base importada tem 77 celulares sem o 9 e 76 com DDD zerado; aplicá-las ao
 * que já está gravado impediria de abrir um contato antigo só para corrigir o
 * nome. Número que não mudou passa; número que mudou entra na regra atual.
 */
function exigirTelefoneValido(phone: unknown, anterior?: string | null) {
  if (phone === null || phone === undefined || phone === "") return;
  const bruto = somenteDigitos(typeof phone === "string" ? phone : "");
  if (!bruto) return;
  const nacional = semDdi(bruto);
  const erro = (message: string) => {
    throw {status: 400, message};
  };
  // Tamanho vale sempre: é o que impede a digitação sem fim.
  if (nacional.length !== 10 && nacional.length !== 11)
    erro("Telefone deve ter 10 ou 11 dígitos, com DDD.");

  const inalterado = anterior !== undefined && semDdi(somenteDigitos(anterior ?? "")) === nacional;
  if (inalterado) return;
  if (nacional.length === 11 && nacional[2] !== "9")
    erro("Celular com 11 dígitos precisa começar com 9 depois do DDD.");
  if (nacional[0] === "0") erro("DDD inválido.");
}

function normalizarUuid(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  if (!UUID_RE.test(limpo)) throw {status: 400, message: "Identificador inválido."};
  return limpo;
}

export function entityContactDto(c: any) {
  return {
    id: c.id,
    entity_id: c.entityId ?? null,
    entity_name: c.entity?.name ?? null,
    type_id: c.typeId ?? null,
    type_name: c.type?.name ?? null,
    is_system_user: c.type?.isSystemUser ?? false,
    user_id: c.userId ?? null,
    name: c.name,
    email: c.email ?? null,
    phone: c.phone ?? null,
    phone_digits: c.phoneDigits ?? null,
    photo: c.photo ?? null,
    birth_date: isoData(c.birthDate),
    is_active: c.isActive,
    receive_messages: c.receiveMessages,
    notes: c.notes ?? null,
    legacy_id: c.legacyId ?? null,
    workspace_id: c.workspaceId,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

function entityContactTypeDto(t: any) {
  return {
    id: t.id,
    name: t.name,
    is_active: t.isActive,
    is_system_user: t.isSystemUser,
    sequence: t.sequence,
    legacy_id: t.legacyId ?? null,
    workspace_id: t.workspaceId,
    created_at: iso(t.createdAt),
    updated_at: iso(t.updatedAt),
  };
}

// Campos com conteúdo pessoal: a trilha registra QUE mudaram, nunca o valor —
// gravar o telefone antigo no log criaria uma segunda cópia do dado.
const CAMPOS_SENSIVEIS = new Set(["email", "phone", "phoneDigits", "birthDate", "photo", "notes"]);
const CAMPOS_AUDITADOS = [
  "name",
  "entityId",
  "typeId",
  "userId",
  "isActive",
  "receiveMessages",
  ...CAMPOS_SENSIVEIS,
];

/**
 * Trilha LGPD do responsável. `changes` leva apenas identificadores e sinalizadores;
 * os campos pessoais entram como nome de campo em `metadata.campos_pessoais_alterados`.
 */
function auditarAlteracao(before: any, after: any) {
  const alterados = CAMPOS_AUDITADOS.filter((campo) => {
    const de = before?.[campo];
    const para = after?.[campo];
    if (de instanceof Date && para instanceof Date) return de.getTime() !== para.getTime();
    return de !== para;
  });
  return {
    changes: auditDiff(before, after, alterados.filter((campo) => !CAMPOS_SENSIVEIS.has(campo))),
    campos_pessoais_alterados: alterados.filter((campo) => CAMPOS_SENSIVEIS.has(campo)),
  };
}

const CAMPOS_SIMPLES: Record<string, string> = {
  name: "name",
  email: "email",
  photo: "photo",
  is_active: "isActive",
  receive_messages: "receiveMessages",
  notes: "notes",
};

const CAMPOS_UUID: Record<string, string> = {
  entity_id: "entityId",
  type_id: "typeId",
  user_id: "userId",
};

/** Só transporta o que o corpo trouxe: no PATCH, campo ausente é campo intocado. */
function dadosDoCorpo(b: any, telefoneAnterior?: string | null) {
  const data: any = {};
  for (const [entrada, coluna] of Object.entries(CAMPOS_SIMPLES)) {
    if (b[entrada] !== undefined) data[coluna] = b[entrada];
  }
  for (const [entrada, coluna] of Object.entries(CAMPOS_UUID)) {
    if (b[entrada] !== undefined) data[coluna] = normalizarUuid(b[entrada]);
  }
  if (b.phone !== undefined) {
    exigirTelefoneValido(b.phone, telefoneAnterior);
    data.phone = b.phone || null;
    data.phoneDigits = derivarPhoneDigits(b.phone);
  }
  if (b.birth_date !== undefined) data.birthDate = b.birth_date ? new Date(b.birth_date) : null;
  return data;
}

/** Entidade e tipo precisam ser do mesmo espaço de trabalho — a FK sozinha não sabe disso. */
async function validarReferencias(workspaceId: string, data: any) {
  if (data.entityId) {
    const entidade = await prisma.entity.findFirst({
      where: {id: data.entityId, workspaceId, deletedAt: null},
      select: {id: true},
    });
    if (!entidade) throw {status: 400, message: "Entidade inválida."};
  }
  if (data.typeId) {
    const tipo = await prisma.entityContactType.findFirst({
      where: {id: data.typeId, workspaceId},
      select: {id: true},
    });
    if (!tipo) throw {status: 400, message: "Tipo de responsável inválido."};
  }
}

function filtrosDeContato(workspaceId: string, q: any) {
  const where: any = {workspaceId, deletedAt: null};
  if (q.entity_id) where.entityId = normalizarUuid(q.entity_id);
  if (q.type_id) where.typeId = normalizarUuid(q.type_id);
  if (q.is_active !== undefined) where.isActive = q.is_active === "true";
  if (q.has_phone !== undefined) where.phoneDigits = q.has_phone === "true" ? {not: null} : null;

  const busca = typeof q.search === "string" ? q.search.trim() : "";
  if (busca) {
    // Telefone é procurado por dígitos: quem digita "(67) 99999-0000" precisa
    // achar o registro guardado como "5567999990000".
    const digitos = somenteDigitos(busca);
    where.OR = [
      {name: {contains: busca, mode: "insensitive"}},
      {email: {contains: busca, mode: "insensitive"}},
      ...(digitos ? [{phoneDigits: {contains: digitos}}] : []),
    ];
  }
  return where;
}

/**
 * Sem `per_page`/`cursor` a listagem responde array puro — é o que as telas de
 * seleção consomem; com um deles, o envelope paginado dos demais módulos.
 */
async function listarContatos(where: any, q: any) {
  const include = INCLUDE_CONTATO;
  const orderBy = {name: "asc"} as const;
  if (q.per_page === undefined && q.cursor === undefined) {
    const itens = await prisma.entityContact.findMany({where, include, orderBy});
    return itens.map(entityContactDto);
  }
  return paginate({
    query: (skip, take) => prisma.entityContact.findMany({where, skip, take, include, orderBy}),
    count: () => prisma.entityContact.count({where}),
    cursor: q.cursor as string | undefined,
    perPage: q.per_page ? Number(q.per_page) : undefined,
    transform: (itens) => itens.map(entityContactDto),
  });
}

/** A listagem responde array puro ou envelope; a trilha registra o total nos dois casos. */
function totalDaListagem(resposta: unknown) {
  return Array.isArray(resposta) ? resposta.length : ((resposta as any)?.total_count ?? 0);
}

const FILTROS_REGISTRADOS = ["entity_id", "type_id", "is_active", "has_phone", "search"];

/** Só os filtros conhecidos entram na trilha — o resto da query não interessa. */
function filtrosDaConsulta(query: any) {
  const usados: Record<string, unknown> = {};
  for (const filtro of FILTROS_REGISTRADOS) {
    if (query?.[filtro] !== undefined) usados[filtro] = query[filtro];
  }
  return usados;
}

export const entityContactModule = new Elysia({prefix: "/workspaces/:slug"})
  .use(authPlugin)

  // Responsáveis ──────────────────────────────────────────────────────────────

  .get("/entity-contacts/", async ({params: {slug}, user, query, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const resposta = await listarContatos(filtrosDeContato(ws.id, query), query);
    // LGPD: consultar uma lista de dados pessoais também é tratamento.
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT,
      entityId: ws.id,
      action: AUDIT_ACTIONS.LIST,
      actor: user,
      headers,
      metadata: {total: totalDaListagem(resposta), filtros: filtrosDaConsulta(query)},
    });
    return resposta;
  })

  .post("/entity-contacts/", async ({params: {slug}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await exigirEscrita(ws.id, user.id);
    const b = body as any;
    if (!b?.name || !String(b.name).trim()) {
      set.status = 400;
      return {detail: "O nome é obrigatório."};
    }
    const data = dadosDoCorpo(b);
    await validarReferencias(ws.id, data);
    const contato = await prisma.entityContact.create({
      data: {...data, name: String(b.name).trim(), workspaceId: ws.id, createdById: user.id},
      include: INCLUDE_CONTATO,
    });
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT,
      entityId: contato.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: user,
      headers,
      metadata: {entity_id: contato.entityId, type_id: contato.typeId},
    });
    set.status = 201;
    return entityContactDto(contato);
  })

  .get("/entity-contacts/:contact_id/", async ({params: {slug, contact_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const contato = await prisma.entityContact.findFirst({
      where: {id: contact_id, workspaceId: ws.id, deletedAt: null},
      include: INCLUDE_CONTATO,
    });
    if (!contato) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT,
      entityId: contato.id,
      action: AUDIT_ACTIONS.VIEW,
      actor: user,
      headers,
      metadata: {entity_id: contato.entityId},
    });
    return entityContactDto(contato);
  })

  .patch("/entity-contacts/:contact_id/", async ({params: {slug, contact_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await exigirEscrita(ws.id, user.id);
    const b = body as any;
    if (b?.name !== undefined && !String(b.name ?? "").trim()) {
      set.status = 400;
      return {detail: "O nome é obrigatório."};
    }
    const antes = await prisma.entityContact.findFirst({
      where: {id: contact_id, workspaceId: ws.id, deletedAt: null},
    });
    if (!antes) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    const data = dadosDoCorpo(b, antes.phone);
    if (data.name !== undefined) data.name = String(data.name).trim();
    await validarReferencias(ws.id, data);
    const contato = await prisma.entityContact.update({
      where: {id: contact_id},
      data,
      include: INCLUDE_CONTATO,
    });
    const trilha = auditarAlteracao(antes, contato);
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT,
      entityId: contato.id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      headers,
      changes: trilha.changes,
      metadata: {campos_pessoais_alterados: trilha.campos_pessoais_alterados},
    });
    return entityContactDto(contato);
  })

  .delete("/entity-contacts/:contact_id/", async ({params: {slug, contact_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await exigirEscrita(ws.id, user.id);
    const contato = await prisma.entityContact.findFirst({
      where: {id: contact_id, workspaceId: ws.id, deletedAt: null},
      select: {id: true, entityId: true, typeId: true},
    });
    if (!contato) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    await prisma.entityContact.update({where: {id: contact_id}, data: {deletedAt: new Date()}});
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT,
      entityId: contato.id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      headers,
      metadata: {entity_id: contato.entityId, type_id: contato.typeId, logica: true},
    });
    set.status = 204;
    return null;
  })

  // Atalho a partir da entidade ───────────────────────────────────────────────

  .get("/entities/:entity_id/contacts/", async ({params: {slug, entity_id}, user, query, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const resposta = await listarContatos({...filtrosDeContato(ws.id, query), entityId: entity_id}, query);
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT,
      entityId: ws.id,
      action: AUDIT_ACTIONS.LIST,
      actor: user,
      headers,
      metadata: {total: totalDaListagem(resposta), filtros: {...filtrosDaConsulta(query), entity_id}},
    });
    return resposta;
  })

  // Tipos de responsável ──────────────────────────────────────────────────────

  .get("/entity-contact-types/", async ({params: {slug}, user, query, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const q = query as any;
    const where: any = {workspaceId: ws.id};
    if (q.is_active !== undefined) where.isActive = q.is_active === "true";
    if (q.is_system_user !== undefined) where.isSystemUser = q.is_system_user === "true";
    const orderBy = [{sequence: "asc"}, {name: "asc"}] as const;
    const resposta =
      q.per_page === undefined && q.cursor === undefined
        ? (await prisma.entityContactType.findMany({where, orderBy: [...orderBy]})).map(entityContactTypeDto)
        : await paginate({
            query: (skip, take) => prisma.entityContactType.findMany({where, skip, take, orderBy: [...orderBy]}),
            count: () => prisma.entityContactType.count({where}),
            cursor: q.cursor as string | undefined,
            perPage: q.per_page ? Number(q.per_page) : undefined,
            transform: (tipos) => tipos.map(entityContactTypeDto),
          });
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT_TYPE,
      entityId: ws.id,
      action: AUDIT_ACTIONS.LIST,
      actor: user,
      headers,
      metadata: {total: totalDaListagem(resposta)},
    });
    return resposta;
  })

  .post("/entity-contact-types/", async ({params: {slug}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await exigirEscrita(ws.id, user.id);
    const b = body as any;
    const nome = String(b?.name ?? "").trim();
    if (!nome) {
      set.status = 400;
      return {detail: "O nome é obrigatório."};
    }
    const duplicado = await prisma.entityContactType.findFirst({
      where: {workspaceId: ws.id, name: nome},
      select: {id: true},
    });
    if (duplicado) {
      set.status = 409;
      return {detail: "Já existe um tipo com este nome.", id: duplicado.id};
    }
    const tipo = await prisma.entityContactType.create({
      data: {
        workspaceId: ws.id,
        name: nome,
        isActive: b.is_active ?? true,
        isSystemUser: b.is_system_user ?? false,
        sequence: b.sequence ?? 0,
        legacyId: b.legacy_id ?? null,
      },
    });
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT_TYPE,
      entityId: tipo.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: user,
      headers,
      metadata: {name: tipo.name},
    });
    set.status = 201;
    return entityContactTypeDto(tipo);
  })

  .patch("/entity-contact-types/:type_id/", async ({params: {slug, type_id}, body, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await exigirEscrita(ws.id, user.id);
    const b = body as any;
    const tipo = await prisma.entityContactType.findFirst({where: {id: type_id, workspaceId: ws.id}});
    if (!tipo) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    const data: any = {};
    if (b.name !== undefined) {
      const nome = String(b.name ?? "").trim();
      if (!nome) {
        set.status = 400;
        return {detail: "O nome é obrigatório."};
      }
      data.name = nome;
    }
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.is_system_user !== undefined) data.isSystemUser = b.is_system_user;
    if (b.sequence !== undefined) data.sequence = b.sequence;
    const atualizado = await prisma.entityContactType.update({where: {id: type_id}, data});
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT_TYPE,
      entityId: atualizado.id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      headers,
      changes: auditDiff(tipo, atualizado, ["name", "isActive", "isSystemUser", "sequence"]),
    });
    return entityContactTypeDto(atualizado);
  })

  .delete("/entity-contact-types/:type_id/", async ({params: {slug, type_id}, user, set, headers}) => {
    const ws = await getWorkspaceOrFail(slug);
    await exigirEscrita(ws.id, user.id);
    const tipo = await prisma.entityContactType.findFirst({
      where: {id: type_id, workspaceId: ws.id},
      select: {id: true, name: true},
    });
    if (!tipo) {
      set.status = 404;
      return {detail: "Não encontrado."};
    }
    // O tipo não tem exclusão lógica no modelo; os responsáveis que apontavam
    // para ele ficam com `type_id` nulo (FK com SetNull) em vez de sumir.
    await prisma.entityContactType.delete({where: {id: type_id}});
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.ENTITY_CONTACT_TYPE,
      entityId: tipo.id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      headers,
      metadata: {name: tipo.name},
    });
    set.status = 204;
    return null;
  });
