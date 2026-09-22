/**
 * "Esqueci minha senha" da conta do portal do cliente.
 *
 * Mesmo núcleo do Plane (`utils/password-reset-flow.ts`) com `kind = portal`:
 * token de uso único, com validade, só o hash gravado. A resposta do pedido é
 * a mesma para e-mail cadastrado ou não. Trocar a senha derruba os crachás do
 * portal emitidos antes (`portal_accounts.token_updated_at`).
 */

import prisma from "@db";
import { espacoPeloSlug, hashSenha, normalizeEmail } from "@modules/portal/conta";
import { readAppBaseUrl, sendEmail } from "@utils/email";
import { createFieldError } from "@utils/field-error";
import { RESET_TOKEN_MINUTES, decodeUid, encodeUid, type ResetTokenState } from "@utils/password-reset";
import { RESET_KINDS, consumeResetTokens, issueResetToken, readResetState } from "@utils/password-reset-flow";

const SENHA_MINIMA = 8;
const KIND = RESET_KINDS.PORTAL;

// O cliente não precisa saber se o link venceu, foi usado ou nunca existiu:
// nos três casos ele pede outro.
const LINK_INVALIDO = "Este link não vale mais. Peça um novo em Esqueci minha senha.";

const TOKEN_ERRORS: Record<Exclude<ResetTokenState, "valid">, string> = {
  invalid: LINK_INVALIDO,
  used: LINK_INVALIDO,
  expired: LINK_INVALIDO,
};

export type PedidoDeRedefinicao = { workspace: unknown; conta: unknown; token: unknown; senha: unknown };

function buildPortalResetUrl(slug: string, contaId: string, token: string): string {
  const params = new URLSearchParams({ workspace: slug, conta: encodeUid(contaId), redefinir: token });
  return `${readAppBaseUrl()}/portal/?${params.toString()}`;
}

/** Envia o link para a conta ativa com este e-mail no espaço; sem conta, não faz nada. */
export async function requestPortalReset(slug: string, email: unknown, requestIp: string | null): Promise<void> {
  const espaco = await espacoPeloSlug(slug);
  if (!espaco) return;
  const conta = await prisma.portalAccount.findFirst({
    where: { workspaceId: espaco.id, email: normalizeEmail(email), isActive: true, deletedAt: null },
    select: { id: true, email: true, name: true },
  });
  if (!conta) return;
  await sendPortalResetLink({ slug, nome: espaco.name }, conta, requestIp);
}

type ContaDoLink = { id: string; email: string; name: string };

/**
 * Emite o token e manda o link de nova senha. Usado pelo "esqueci minha senha"
 * do cliente e pelo "redefinir senha" da tela de contas.
 */
export async function sendPortalResetLink(
  espaco: { slug: string; nome: string },
  conta: ContaDoLink,
  requestIp: string | null
): Promise<void> {
  const { slug } = espaco;
  const token = await issueResetToken(KIND, conta.id, requestIp);
  await sendEmail(conta.email, {
    subject: `${espaco.nome}: nova senha do portal`,
    title: `Olá, ${conta.name}`,
    paragraphs: [
      "Recebemos um pedido para criar uma nova senha de acesso ao portal de solicitações.",
      `O link vale por ${RESET_TOKEN_MINUTES} minutos e pode ser usado uma única vez.`,
      "Se você não pediu, ignore esta mensagem. A senha atual continua valendo.",
    ],
    action: { label: "Criar nova senha", url: buildPortalResetUrl(slug, conta.id, token) },
  });
}

/** A conta do link, se ela for deste espaço. */
async function findContaDoLink(pedido: PedidoDeRedefinicao) {
  const espaco = await espacoPeloSlug(String(pedido.workspace ?? ""));
  const contaId = decodeUid(String(pedido.conta ?? ""));
  if (!espaco || !contaId) return null;
  return prisma.portalAccount.findFirst({
    where: { id: contaId, workspaceId: espaco.id, deletedAt: null },
    select: { id: true, workspaceId: true, email: true },
  });
}

/**
 * Troca a senha com o token do link. Senha curta não gasta o link: o cliente
 * escolhe outra. Na troca, os outros links pendentes deixam de valer.
 */
export async function applyPortalReset(pedido: PedidoDeRedefinicao) {
  const conta = await findContaDoLink(pedido);
  const state = await readResetState(KIND, conta?.id ?? null, String(pedido.token ?? ""));
  if (state !== "valid") throw createFieldError("token", TOKEN_ERRORS[state]);
  const senha = typeof pedido.senha === "string" ? pedido.senha : "";
  if (senha.length < SENHA_MINIMA) {
    throw createFieldError("senha", `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
  }

  const hash = await hashSenha(senha);
  const now = new Date();
  const contaValida = conta as NonNullable<typeof conta>;
  await prisma.$transaction(async (tx) => {
    await tx.portalAccount.update({ where: { id: contaValida.id }, data: { password: hash, tokenUpdatedAt: now } });
    await consumeResetTokens(tx, KIND, contaValida.id, now);
  });
  return contaValida;
}
