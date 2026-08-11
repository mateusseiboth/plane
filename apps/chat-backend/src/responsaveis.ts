/**
 * Responsáveis — as pessoas de carne e osso dentro do cliente (prefeitura,
 * câmara). É o cadastro oficial, em `entity_contacts`, e é por ele que o chat
 * sabe com quem está falando no WhatsApp.
 *
 * A tabela pertence à API principal (api-ts): dela são o schema e a migração.
 * Aqui o acesso é por SQL puro — exatamente como o chat já faz com `projects`,
 * `users` e `workspace_members`. Declarar o model no schema Prisma do chat
 * criaria uma SEGUNDA definição da mesma tabela: na primeira coluna que o
 * api-ts mudasse, o chat quebraria em execução sem nada aqui ter sido tocado,
 * e um `prisma migrate diff` do chat passaria a propor mexer numa tabela que
 * não é dele.
 *
 * Lembrete que vale para o arquivo inteiro: o `workspaceId` do chat é o SLUG do
 * workspace; `entity_contacts.workspace_id` é o UUID. Todo caminho passa por
 * `workspaceIdDoSlug`.
 */

import { randomUUID } from "crypto";
import prisma from "@db";

export type Responsavel = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  phoneDigits: string | null;
  entityId: string | null;
  entityName: string | null;
  typeId: string | null;
};

export type DadosDoResponsavel = {
  /** Quando informado, atualiza este cadastro em vez de procurar/criar. */
  id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  entityId?: string | null;
  typeId?: string | null;
};

const CAMPOS = `ec.id::text AS id,
                ec.name AS name,
                ec.email AS email,
                ec.phone AS phone,
                ec.phone_digits AS "phoneDigits",
                ec.entity_id::text AS "entityId",
                e.name AS "entityName",
                ec.type_id::text AS "typeId"`;

/** Marca a origem do cadastro nascido no encerramento do atendimento. */
const ORIGEM_CHAT = "chat";

export function somenteDigitos(valor?: string | null): string {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * Mesma regra do contrato de Responsáveis: só dígitos, com DDI 55 quando o
 * número vem no formato brasileiro sem ele (10 ou 11 dígitos).
 */
export function telefoneComDdi(valor?: string | null): string {
  const digitos = somenteDigitos(valor);
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

/**
 * O nono dígito é a maior fonte de "não encontrado": o WhatsApp entrega
 * 55 DD 9XXXXXXXX e o cadastro herdado do SAC muitas vezes guardou
 * 55 DD XXXXXXXX — ou o contrário. Procuramos por todas as formas plausíveis
 * do MESMO número, com e sem DDI.
 */
export function variantesDeTelefone(valor?: string | null): string[] {
  const comDdi = telefoneComDdi(valor);
  if (comDdi.length < 10) return [];

  const variantes = new Set<string>([comDdi]);
  const local = comDdi.startsWith("55") ? comDdi.slice(2) : comDdi;
  variantes.add(local);

  const semNono = local.length === 11 && local[2] === "9" ? `${local.slice(0, 2)}${local.slice(3)}` : null;
  const comNono = local.length === 10 ? `${local.slice(0, 2)}9${local.slice(2)}` : null;
  for (const alternativa of [semNono, comNono]) {
    if (!alternativa) continue;
    variantes.add(alternativa);
    variantes.add(`55${alternativa}`);
  }
  return [...variantes];
}

/** UUID do workspace a partir do slug (o identificador que o chat usa). */
export async function workspaceIdDoSlug(slug: string): Promise<string | null> {
  const linhas = (await prisma.$queryRaw`
    SELECT id::text AS id FROM workspaces WHERE slug = ${slug} AND deleted_at IS NULL LIMIT 1
  `) as Array<{ id: string }>;
  return linhas[0]?.id ?? null;
}

async function buscar(workspaceId: string, condicao: string, ...valores: unknown[]): Promise<Responsavel | null> {
  const linhas = await prisma.$queryRawUnsafe<Responsavel[]>(
    `SELECT ${CAMPOS}
       FROM entity_contacts ec
       LEFT JOIN entities e ON e.id = ec.entity_id
      WHERE ec.workspace_id = $1::uuid
        AND ec.deleted_at IS NULL
        AND ${condicao}
      ORDER BY ec.updated_at DESC
      LIMIT 1`,
    workspaceId,
    ...valores
  );
  return linhas[0] ?? null;
}

export async function buscarResponsavelPorId(slug: string, id: string): Promise<Responsavel | null> {
  try {
    const workspaceId = await workspaceIdDoSlug(slug);
    if (!workspaceId) return null;
    return await buscar(workspaceId, "ec.id = $2::uuid", id);
  } catch (e) {
    console.error("[responsaveis] busca por id", e);
    return null;
  }
}

/**
 * Quem é o dono deste número de WhatsApp. Só cadastros ativos: um responsável
 * desligado do órgão não deve ser tratado pelo nome como se ainda respondesse
 * por ele.
 *
 * Nunca lança: uma falha aqui não pode impedir a saudação do bot — o
 * atendimento continua, apenas sem o nome.
 */
export async function buscarResponsavelPorTelefone(
  slug: string,
  telefone?: string | null
): Promise<Responsavel | null> {
  const variantes = variantesDeTelefone(telefone);
  if (!variantes.length) return null;
  try {
    const workspaceId = await workspaceIdDoSlug(slug);
    if (!workspaceId) return null;
    const marcadores = variantes.map((_, i) => `$${i + 2}`).join(", ");
    return await buscar(workspaceId, `ec.is_active = true AND ec.phone_digits IN (${marcadores})`, ...variantes);
  } catch (e) {
    console.error("[responsaveis] busca por telefone", e);
    return null;
  }
}

async function criarResponsavel(
  slug: string,
  dados: DadosDoResponsavel,
  criadoPorId?: string | null
): Promise<Responsavel | null> {
  const nome = (dados.name ?? "").trim();
  if (!nome) return null;
  const workspaceId = await workspaceIdDoSlug(slug);
  if (!workspaceId) return null;

  const id = randomUUID();
  const telefone = (dados.phone ?? "").trim() || null;
  await prisma.$executeRawUnsafe(
    `INSERT INTO entity_contacts
       (id, created_at, updated_at, created_by_id, workspace_id, entity_id, type_id,
        name, email, phone, phone_digits, external_source)
     VALUES ($1::uuid, now(), now(), $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9, $10)`,
    id,
    criadoPorId ?? null,
    workspaceId,
    dados.entityId ?? null,
    dados.typeId ?? null,
    nome,
    (dados.email ?? "").trim() || null,
    telefone,
    telefoneComDdi(telefone) || null,
    ORIGEM_CHAT
  );
  return buscar(workspaceId, "ec.id = $2::uuid", id);
}

/** Colunas que aceitam atualização direta, no formato `[coluna, cast]`. */
const ATUALIZAVEIS: Array<[keyof DadosDoResponsavel, string, string]> = [
  ["name", "name", ""],
  ["email", "email", ""],
  ["entityId", "entity_id", "::uuid"],
  ["typeId", "type_id", "::uuid"],
];

export async function atualizarResponsavel(
  slug: string,
  id: string,
  dados: DadosDoResponsavel
): Promise<Responsavel | null> {
  const workspaceId = await workspaceIdDoSlug(slug);
  if (!workspaceId) return null;

  const atribuicoes: string[] = [];
  const valores: unknown[] = [];
  const atribuir = (coluna: string, valor: unknown, cast = "") => {
    valores.push(valor);
    atribuicoes.push(`${coluna} = $${valores.length}${cast}`);
  };

  for (const [campo, coluna, cast] of ATUALIZAVEIS) {
    const valor = typeof dados[campo] === "string" ? (dados[campo] as string).trim() : dados[campo];
    if (valor) atribuir(coluna, valor, cast);
  }
  const telefone = (dados.phone ?? "").trim();
  if (telefone) {
    atribuir("phone", telefone);
    atribuir("phone_digits", telefoneComDdi(telefone) || null);
  }
  if (!atribuicoes.length) return buscar(workspaceId, "ec.id = $2::uuid", id);

  valores.push(id, workspaceId);
  await prisma.$executeRawUnsafe(
    `UPDATE entity_contacts
        SET ${atribuicoes.join(", ")}, updated_at = now()
      WHERE id = $${valores.length - 1}::uuid AND workspace_id = $${valores.length}::uuid`,
    ...valores
  );
  return buscar(workspaceId, "ec.id = $2::uuid", id);
}

/**
 * Grava o responsável do atendimento: atualiza o cadastro apontado, senão o do
 * mesmo telefone, e só cria quando de fato não existe ninguém.
 *
 * É essa ordem que cumpre a regra do produto — "se o cliente não tem cadastro,
 * vai para esse cadastro" — sem encher `entity_contacts` de gêmeos a cada
 * atendimento do mesmo número.
 */
export async function salvarResponsavel(
  slug: string,
  dados: DadosDoResponsavel,
  criadoPorId?: string | null
): Promise<Responsavel | null> {
  try {
    const existente = dados.id
      ? await buscarResponsavelPorId(slug, dados.id)
      : await buscarResponsavelPorTelefone(slug, dados.phone);
    if (existente) return await atualizarResponsavel(slug, existente.id, dados);
    return await criarResponsavel(slug, dados, criadoPorId);
  } catch (e) {
    console.error("[responsaveis] gravação", e);
    return null;
  }
}
