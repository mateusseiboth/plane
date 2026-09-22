/**
 * Administração das contas do portal (Configurações > Portal do cliente).
 *
 * Quem chama já passou por `portal.manage`. Aqui ficam a gravação, a conferência
 * das referências (entidade e sistemas precisam ser do espaço) e a redefinição
 * de senha: link por e-mail quando há SMTP, senha provisória quando não há ou
 * quando o administrador pede.
 */

import prisma from "@db";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { isEmailEnabled } from "@utils/email";
import type { HttpError } from "@utils/field-error";
import { hashSenha } from "@modules/portal/conta";
import {
  buildSenhaProvisoria,
  pickModoDeRedefinicao,
  readContaPayload,
  type ContaPayload,
} from "@modules/portal/contas-admin";
import { buildErrosDeCampo } from "@modules/portal/regras-do-cliente";
import { sendPortalResetLink } from "@modules/portal/senha";

type Espaco = { id: string; slug: string; name: string };
type Autor = { id: string; email?: string | null };
type Contexto = { espaco: Espaco; autor: Autor; headers?: Record<string, string | undefined> };

const CONTA_INCLUDE = {
  projects: { select: { projectId: true } },
  entity: { select: { id: true, name: true } },
} as const;

const NAO_ENCONTRADA: HttpError = { status: 404, message: "Conta não encontrada." };

export function contaAdminDto(conta: any) {
  return {
    id: conta.id,
    name: conta.name,
    email: conta.email,
    entity_id: conta.entityId,
    entity: conta.entity ? { id: conta.entity.id, name: conta.entity.name } : null,
    is_active: conta.isActive,
    last_login_at: conta.lastLoginAt?.toISOString() ?? null,
    project_ids: (conta.projects ?? []).map((p: any) => p.projectId),
    created_at: conta.createdAt?.toISOString() ?? null,
  };
}

async function findConta(workspaceId: string, id: string) {
  const conta = await prisma.portalAccount.findFirst({ where: { id, workspaceId, deletedAt: null } });
  if (!conta) throw NAO_ENCONTRADA;
  return conta;
}

/** Entidade e sistemas têm de ser do espaço; o erro volta no campo. */
async function requireReferencias(workspaceId: string, payload: ContaPayload): Promise<void> {
  const [entidade, sistemas] = await Promise.all([
    payload.entityId
      ? prisma.entity.findFirst({ where: { id: payload.entityId, workspaceId, deletedAt: null }, select: { id: true } })
      : Promise.resolve({ id: "" }),
    payload.projectIds?.length
      ? prisma.project.count({ where: { id: { in: payload.projectIds }, workspaceId, deletedAt: null } })
      : Promise.resolve(0),
  ]);
  const errors = [
    ...(entidade ? [] : [{ path: "entity_id", message: "Escolha uma entidade cadastrada neste espaço." }]),
    ...(sistemas === (payload.projectIds?.length ?? 0)
      ? []
      : [{ path: "project_ids", message: "Escolha só sistemas deste espaço." }]),
  ];
  if (errors.length) throw buildErrosDeCampo(errors);
}

async function requireEmailLivre(workspaceId: string, email: string | undefined, contaId?: string): Promise<void> {
  if (!email) return;
  const outra = await prisma.portalAccount.findFirst({
    where: { workspaceId, email, deletedAt: null, ...(contaId ? { id: { not: contaId } } : {}) },
    select: { id: true },
  });
  if (!outra) return;
  const message = "Já existe uma conta do portal com este e-mail.";
  throw { status: 409, message, errors: [{ path: "email", message }] } satisfies HttpError;
}

/** Substitui a lista de sistemas da conta: acesso é concedido por inteiro. */
async function saveSistemas(accountId: string, projectIds: string[] | undefined) {
  if (!projectIds) return;
  await prisma.portalAccountProject.deleteMany({ where: { accountId } });
  if (!projectIds.length) return;
  await prisma.portalAccountProject.createMany({
    data: projectIds.map((projectId) => ({ accountId, projectId })),
    skipDuplicates: true,
  });
}

function recordContaAudit(ctx: Contexto, entityId: string, action: string, metadata: object) {
  recordAudit({
    workspaceId: ctx.espaco.id,
    entity: AUDIT_ENTITIES.USER,
    entityId,
    action,
    actor: ctx.autor,
    headers: ctx.headers,
    metadata: { origem: "portal", ...metadata },
  });
}

const readContaCompleta = async (id: string) =>
  contaAdminDto(await prisma.portalAccount.findFirstOrThrow({ where: { id }, include: CONTA_INCLUDE }));

export async function listContas(workspaceId: string) {
  const contas = await prisma.portalAccount.findMany({
    where: { workspaceId, deletedAt: null },
    include: CONTA_INCLUDE,
    orderBy: { name: "asc" },
  });
  return contas.map(contaAdminDto);
}

export async function createConta(ctx: Contexto, corpo: Record<string, unknown>) {
  const payload = readContaPayload(corpo, true);
  await requireReferencias(ctx.espaco.id, payload);
  await requireEmailLivre(ctx.espaco.id, payload.email);
  const conta = await prisma.portalAccount.create({
    data: {
      workspaceId: ctx.espaco.id,
      email: payload.email as string,
      password: await hashSenha(payload.password as string),
      name: payload.name as string,
      entityId: payload.entityId ?? null,
    },
  });
  await saveSistemas(conta.id, payload.projectIds);
  recordContaAudit(ctx, conta.id, AUDIT_ACTIONS.CREATE, { email: conta.email });
  return readContaCompleta(conta.id);
}

export async function updateConta(ctx: Contexto, id: string, corpo: Record<string, unknown>) {
  await findConta(ctx.espaco.id, id);
  const payload = readContaPayload(corpo, false);
  await requireReferencias(ctx.espaco.id, payload);
  await requireEmailLivre(ctx.espaco.id, payload.email, id);
  const { projectIds, password, ...dados } = payload;
  await prisma.portalAccount.update({
    where: { id },
    data: {
      ...dados,
      ...(password ? { password: await hashSenha(password), tokenUpdatedAt: new Date() } : {}),
    },
  });
  await saveSistemas(id, projectIds);
  // A senha nova nunca entra na trilha; só o fato de ter sido trocada.
  recordContaAudit(ctx, id, AUDIT_ACTIONS.UPDATE, { senha_trocada: Boolean(password) });
  return readContaCompleta(id);
}

/** Exclusão lógica: as solicitações que a conta abriu continuam de pé. */
export async function deleteConta(ctx: Contexto, id: string) {
  await findConta(ctx.espaco.id, id);
  await prisma.portalAccount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  recordContaAudit(ctx, id, AUDIT_ACTIONS.DELETE, {});
}

/**
 * Redefine a senha da conta.
 *
 * - `email`: manda o link de nova senha (mesmo fluxo do "esqueci minha senha").
 *   A senha atual segue valendo até o cliente usar o link.
 * - `provisoria`: grava uma senha nova, derruba as sessões abertas e devolve a
 *   senha UMA vez, para o administrador repassar. Ela não fica em lugar nenhum.
 */
export async function resetSenhaDaConta(ctx: Contexto, id: string, corpo: Record<string, unknown>, ip: string | null) {
  const conta = await findConta(ctx.espaco.id, id);
  const modo = pickModoDeRedefinicao(corpo.modo, await isEmailEnabled());
  recordContaAudit(ctx, id, AUDIT_ACTIONS.PASSWORD_CHANGE, { redefinicao: modo });

  if (modo === "email") {
    await sendPortalResetLink({ slug: ctx.espaco.slug, nome: ctx.espaco.name }, conta, ip);
    return { mode: modo, detail: `Enviamos o link de nova senha para ${conta.email}.` };
  }
  const senha = buildSenhaProvisoria();
  await prisma.portalAccount.update({
    where: { id },
    data: { password: await hashSenha(senha), tokenUpdatedAt: new Date() },
  });
  return { mode: modo, password: senha, detail: "Senha provisória gerada. Repasse ao cliente." };
}
