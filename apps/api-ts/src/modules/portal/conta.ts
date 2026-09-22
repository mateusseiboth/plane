/**
 * A conta do portal: quem é o cliente, o que ele enxerga e como ele entra.
 *
 * A conta é DO PORTAL — não é usuário do Plane e não é Responsável da entidade.
 * A razão é de produto: quem abre solicitação pelo portal não deve virar membro
 * do espaço (cadeira, permissão, aparecer em seletor de responsável) e não deve
 * herdar o cadastro de contato, que serve a outra coisa. O vínculo com a
 * entidade fica num campo, não numa identidade compartilhada.
 *
 * Acesso é concedido, nunca presumido: sem linha em `portal_account_projects` a
 * conta não abre solicitação para projeto nenhum.
 */

import prisma from "@db";
import { isSessionRevoked } from "@utils/session-rules";

/** Mesmo custo do login do Plane (`modules/auth`) — senha fraca não é opção. */
const BCRYPT = { algorithm: "bcrypt", cost: 12 } as const;

export type ContaDoPortal = {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  entityId: string | null;
  /** Versão da sessão: trocar a senha derruba os crachás anteriores. */
  tokenUpdatedAt: Date | null;
};

const CAMPOS = {
  id: true,
  workspaceId: true,
  email: true,
  name: true,
  entityId: true,
  tokenUpdatedAt: true,
} as const;

export function normalizeEmail(email: unknown): string {
  return String(email ?? "")
    .toLowerCase()
    .trim();
}

export function hashSenha(senha: string): Promise<string> {
  return Bun.password.hash(senha, BCRYPT);
}

/**
 * O espaço de trabalho pelo slug — o portal é sempre aberto com `?workspace=`.
 * `null` quando não existe: o portal não diz qual dos dois errou.
 */
export async function espacoPeloSlug(slug: string): Promise<{ id: string; name: string } | null> {
  const ws = await prisma.workspace.findFirst({
    where: { slug: String(slug ?? "").trim(), deletedAt: null },
    select: { id: true, name: true },
  });
  return ws ?? null;
}

/**
 * E-mail e senha conferem? `null` para conta inexistente, desativada, excluída
 * ou senha errada — a tela mostra a mesma frase para os quatro casos, porque
 * dizer "esse e-mail existe" já é contar demais a quem tenta adivinhar.
 */
export async function authenticate(workspaceId: string, email: unknown, senha: unknown): Promise<ContaDoPortal | null> {
  const conta = await prisma.portalAccount.findFirst({
    where: { workspaceId, email: normalizeEmail(email), isActive: true, deletedAt: null },
  });
  if (!conta) return null;
  if (typeof senha !== "string" || !senha) return null;
  if (!(await Bun.password.verify(senha, conta.password))) return null;

  await prisma.portalAccount.update({ where: { id: conta.id }, data: { lastLoginAt: new Date() } });
  return {
    id: conta.id,
    workspaceId: conta.workspaceId,
    email: conta.email,
    name: conta.name,
    entityId: conta.entityId,
    tokenUpdatedAt: conta.tokenUpdatedAt,
  };
}

/**
 * A conta por trás do crachá, revalidada a cada pedido: desativar uma conta ou
 * trocar a senha precisa valer agora, e não só quando o token de sete dias vencer.
 */
export async function contaAtiva(contaId: string, workspaceId: string, versao: unknown): Promise<ContaDoPortal | null> {
  const conta = await prisma.portalAccount.findFirst({
    where: { id: contaId, workspaceId, isActive: true, deletedAt: null },
    select: CAMPOS,
  });
  if (!conta || isSessionRevoked(versao, conta.tokenUpdatedAt)) return null;
  return conta;
}

/** Os sistemas que a conta enxerga, em ordem alfabética. */
export async function sistemasDaConta(conta: ContaDoPortal) {
  const vinculos = await prisma.portalAccountProject.findMany({
    where: { accountId: conta.id, project: { deletedAt: null } },
    select: { project: { select: { id: true, name: true, identifier: true } } },
  });
  return vinculos.map((v) => v.project).toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Id vindo de fora tem formato de UUID?
 *
 * O portal é rota pública: o `sistema_id` do corpo e o `:id` da URL são
 * digitados pelo navegador de quem quiser. Entregues crus ao Prisma, um valor
 * como "ALMOXA" estoura `invalid input syntax for type uuid` — 500 no cliente e
 * stack do driver no log, que ainda conta o formato da coluna. Filtrando aqui,
 * id malformado segue o MESMO caminho de id inexistente, que é o que ele é.
 */
export function isUuid(valor: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
}

/** O projeto pedido, se a conta tiver acesso a ele. */
export async function sistemaLiberado(conta: ContaDoPortal, projectId: string) {
  if (!isUuid(projectId)) return null;
  const vinculo = await prisma.portalAccountProject.findFirst({
    where: { accountId: conta.id, projectId, project: { deletedAt: null } },
    select: { project: { select: { id: true, name: true, identifier: true, workspaceId: true } } },
  });
  return vinculo?.project ?? null;
}
