import { Elysia } from "elysia";
import prisma from "@db";
import { isRotaSemRastro } from "@utils/rota-sem-rastro";
import { isSessionRevoked, readSessionClaims, readSessionVersion } from "@utils/session";

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  isInstanceAdmin: boolean;
  isSuperuser: boolean;
};

const AUTH_USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  isInstanceAdmin: true,
  isSuperuser: true,
} as const;

async function resolveApiKey(apiKey: string, isSemRastro = false): Promise<AuthUser | null> {
  const token = await prisma.apiToken.findUnique({
    where: { token: apiKey, isActive: true },
    include: {
      user: { select: { ...AUTH_USER_SELECT, isActive: true } },
    },
  });
  if (!token) return null;
  if (token.expiredAt && token.expiredAt < new Date()) return null;
  // Usuário congelado ou desativado perde também o acesso por chave de API.
  if (token.user.isActive === false) return null;
  // Rota sem rastro (denúncia): o "último uso" seria a hora exata da denúncia.
  if (!isSemRastro) prisma.apiToken.update({ where: { id: token.id }, data: { lastUsed: new Date() } }).catch(() => {});
  const { isActive: _isActive, ...user } = token.user;
  return user;
}

/**
 * Falha temporária de infraestrutura (banco fora do ar, pool esgotado).
 * Precisa de um tipo próprio porque um `catch` genérico aqui transformava
 * indisponibilidade em 401: para o usuário isso aparecia como logout aleatório,
 * e o front ainda limpava a sessão. Token inválido é 401; banco fora é 503.
 */
class AuthUnavailableError extends Error {}

async function resolveJwt(rawToken: string): Promise<AuthUser | null> {
  const claims = await readSessionClaims(rawToken);
  if (!claims) return null;
  // Fora do try: erro de banco NÃO pode virar "credencial inválida".
  const found = await prisma.user.findUnique({
    where: { id: String(claims.sub), isActive: true, deletedAt: null },
    select: { ...AUTH_USER_SELECT, tokenUpdatedAt: true },
  });
  if (!found || isSessionRevoked(readSessionVersion(claims), found.tokenUpdatedAt)) return null;
  const { tokenUpdatedAt: _tokenUpdatedAt, ...user } = found;
  return user;
}

/** Executa uma tentativa de autenticação convertendo falha de banco em 503. */
async function tentar(resolver: () => Promise<AuthUser | null>): Promise<AuthUser | null> {
  try {
    return await resolver();
  } catch (error) {
    throw new AuthUnavailableError("Serviço de autenticação indisponível. Tente novamente.", { cause: error });
  }
}

type Cabecalhos = Record<string, string | undefined>;

/**
 * Por onde a pessoa entrou. A sessão (cookie ou Bearer) é gente na tela; a
 * chave de API é script ou integração. Há regra que só vale para gente: mudar
 * a etapa do chamado exige comentário antes (@modules/issue/movimentacao.rules).
 */
export type Credencial = "sessao" | "chave-de-api";

export type Autenticado = { user: AuthUser; credencial: Credencial };

type Tentativa = { credencial: Credencial; resolver: () => Promise<AuthUser | null> };

function buildTentativas(headers: Cabecalhos, request: Request): Tentativa[] {
  const tentativas: Tentativa[] = [];

  // 1. X-Api-Key header
  const apiKey = headers["x-api-key"];
  const isSemRastro = isRotaSemRastro(request.method, new URL(request.url).pathname);
  if (apiKey) tentativas.push({ credencial: "chave-de-api", resolver: () => resolveApiKey(apiKey, isSemRastro) });

  // 2. Bearer token from Authorization header
  const authHeader = headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    tentativas.push({ credencial: "sessao", resolver: () => resolveJwt(authHeader.slice(7)) });
  }

  // 3. JWT from plane_auth cookie (Elysia built-in cookie access)
  const match = (headers["cookie"] ?? "").match(/(?:^|;\s*)plane_auth=([^;]+)/);
  if (match?.[1]) tentativas.push({ credencial: "sessao", resolver: () => resolveJwt(decodeURIComponent(match[1])) });

  return tentativas;
}

/**
 * Quem está falando e por qual credencial, ou `null` quando não há credencial
 * válida. Falha de banco continua sendo `AuthUnavailableError`.
 */
export async function resolveAutenticado(headers: Cabecalhos, request: Request): Promise<Autenticado | null> {
  // Em série de propósito: a primeira credencial válida vence, na ordem acima.
  for (const { credencial, resolver } of buildTentativas(headers, request)) {
    // oxlint-disable-next-line no-await-in-loop
    const user = await tentar(resolver);
    if (user) return { user, credencial };
  }
  return null;
}

/**
 * Quem está falando, ou `null` quando não há credencial nenhuma. Não recusa:
 * é para rota que aceita MAIS DE UMA forma de autenticação (o painel de TV
 * aceita sessão do Plane ou chave de painel). Falha de banco continua sendo
 * `AuthUnavailableError`, nunca "credencial inválida".
 */
export async function resolveUsuarioOpcional(headers: Cabecalhos, request: Request): Promise<AuthUser | null> {
  return (await resolveAutenticado(headers, request))?.user ?? null;
}

export const authPlugin = new Elysia({ name: "auth" }).derive({ as: "global" }, async (ctx) => {
  try {
    const autenticado = await resolveAutenticado(ctx.headers, ctx.request);
    if (autenticado) return autenticado;
  } catch (error) {
    if (!(error instanceof AuthUnavailableError)) throw error;
    console.error("[auth] falha ao resolver credencial:", error.cause);
    ctx.set.status = 503;
    throw new Error(error.message, { cause: error });
  }

  ctx.set.status = 401;
  throw new Error("Credenciais de autenticação não foram fornecidas.");
});
