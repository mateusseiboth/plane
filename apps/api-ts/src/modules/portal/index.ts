/**
 * Portal do cliente — rotas públicas (`/portal`) e a gestão das contas.
 *
 * Duas naturezas no mesmo módulo, separadas pelo crachá:
 *
 *  - `/portal` e `/portal/api/*` falam com o CLIENTE, autenticado pelo token do
 *    portal (`modules/portal/token`). Nenhuma delas usa o `authPlugin` do Plane:
 *    a conta do portal não é usuário do produto e não deve poder virar um.
 *  - `/workspaces/:slug/portal-accounts/*` é a administração dessas contas, e aí
 *    sim vale o crachá do Plane, restrito ao administrador do espaço.
 */

import Elysia from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, recordAudit } from "@utils/audit";
import { checkRateLimit } from "@utils/rate-limiter";
import { getWorkspaceOrFail, requireWorkspaceAdmin } from "@utils/workspace";
import {
  autenticar,
  contaAtiva,
  espacoPeloSlug,
  gerarHashDeSenha,
  normalizarEmail,
  sistemaLiberado,
  sistemasDaConta,
  type ContaDoPortal,
} from "@modules/portal/conta";
import { paginaDoPortal } from "@modules/portal/pagina";
import { abrirSolicitacao, solicitacaoDaConta, solicitacoesDaConta } from "@modules/portal/solicitacoes";
import { assinarTokenDoPortal, lerTokenDoPortal } from "@modules/portal/token";

/** Mesma frase para e-mail inexistente e senha errada: a tela não entrega quem existe. */
const CREDENCIAL_INVALIDA = "E-mail ou senha inválidos.";
const SENHA_MINIMA = 8;
/** Tentativas de login por IP a cada 5 minutos. */
const TENTATIVAS = { max: 10, janelaMs: 5 * 60_000 };

function ipDaRequisicao(headers: Record<string, string | undefined>): string {
  return (headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() || headers["x-real-ip"] || "desconhecido";
}

function contaDto(conta: ContaDoPortal) {
  return { id: conta.id, nome: conta.name, email: conta.email };
}

/** O crachá do portal já resolvido em conta ativa; `null` manda a página pedir login de novo. */
async function contaDoPedido(headers: Record<string, string | undefined>): Promise<ContaDoPortal | null> {
  const bruto = headers["authorization"]?.startsWith("Bearer ") ? headers["authorization"].slice(7) : null;
  const cracha = await lerTokenDoPortal(bruto);
  if (!cracha) return null;
  return contaAtiva(cracha.contaId, cracha.workspaceId);
}

const naoAutenticado = (set: any) => {
  set.status = 401;
  return { detail: "Entre novamente para continuar." };
};

export const portalModule = new Elysia({ prefix: "/portal" })
  // ── A página ────────────────────────────────────────────────────────────────
  .get("/", ({ set }) => {
    set.headers["content-type"] = "text/html; charset=utf-8";
    return paginaDoPortal();
  })

  // ── Nome do espaço, para o cabeçalho da página ─────────────────────────────
  .get("/api/espaco", async ({ query }) => {
    const espaco = await espacoPeloSlug(String((query as any).workspace ?? ""));
    return { nome: espaco?.name ?? "Central de Solicitações" };
  })

  // ── Entrar ────────────────────────────────────────────────────────────────
  .post("/api/entrar", async ({ body, headers, set }) => {
    const b = (body ?? {}) as any;
    if (!checkRateLimit(`portal-login:${ipDaRequisicao(headers as any)}`, TENTATIVAS.max, TENTATIVAS.janelaMs)) {
      set.status = 429;
      return { detail: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
    }
    const espaco = await espacoPeloSlug(String(b.workspace ?? ""));
    if (!espaco) {
      set.status = 403;
      return { detail: CREDENCIAL_INVALIDA };
    }
    const conta = await autenticar(espaco.id, b.email, b.senha);
    if (!conta) {
      recordAudit({
        workspaceId: espaco.id,
        entity: AUDIT_ENTITIES.USER,
        entityId: normalizarEmail(b.email) || "desconhecido",
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        actor: { email: normalizarEmail(b.email) },
        headers: headers as any,
        metadata: { origem: "portal" },
      });
      set.status = 403;
      return { detail: CREDENCIAL_INVALIDA };
    }
    recordAudit({
      workspaceId: espaco.id,
      entity: AUDIT_ENTITIES.USER,
      entityId: conta.id,
      action: AUDIT_ACTIONS.LOGIN,
      actor: { id: conta.id, email: conta.email },
      headers: headers as any,
      metadata: { origem: "portal" },
    });
    return { token: await assinarTokenDoPortal(conta.id, conta.workspaceId), conta: contaDto(conta) };
  })

  // ── Quem sou eu (retomada de sessão) ──────────────────────────────────────
  .get("/api/eu", async ({ headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { conta: contaDto(conta) };
  })

  // ── Sistemas liberados para a conta ───────────────────────────────────────
  .get("/api/sistemas", async ({ headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { results: await sistemasDaConta(conta) };
  })

  // ── Minhas solicitações ───────────────────────────────────────────────────
  .get("/api/solicitacoes", async ({ headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    return { results: await solicitacoesDaConta(conta) };
  })

  .get("/api/solicitacoes/:id", async ({ params: { id }, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    const solicitacao = await solicitacaoDaConta(conta, id);
    if (!solicitacao) {
      set.status = 404;
      return { detail: "Solicitação não encontrada." };
    }
    return solicitacao;
  })

  // ── Abrir solicitação ─────────────────────────────────────────────────────
  .post("/api/solicitacoes", async ({ body, headers, set }) => {
    const conta = await contaDoPedido(headers as any);
    if (!conta) return naoAutenticado(set);
    const b = (body ?? {}) as any;
    if (!String(b.titulo ?? "").trim()) {
      set.status = 400;
      return { detail: "Escreva um resumo em uma linha." };
    }
    const sistema = await sistemaLiberado(conta, String(b.sistema_id ?? ""));
    if (!sistema) {
      set.status = 403;
      return { detail: "Escolha um dos sistemas liberados para você." };
    }
    set.status = 201;
    return abrirSolicitacao(conta, sistema, b, headers as any);
  });

// ── Administração das contas (crachá do Plane, só administrador) ─────────────

function contaAdminDto(conta: any) {
  return {
    id: conta.id,
    name: conta.name,
    email: conta.email,
    entity_id: conta.entityId,
    is_active: conta.isActive,
    last_login_at: conta.lastLoginAt?.toISOString() ?? null,
    project_ids: (conta.projects ?? []).map((p: any) => p.projectId),
    created_at: conta.createdAt?.toISOString() ?? null,
  };
}

/** Substitui a lista de sistemas da conta — acesso é concedido por inteiro. */
async function definirSistemas(accountId: string, projectIds: unknown) {
  if (!Array.isArray(projectIds)) return;
  await prisma.portalAccountProject.deleteMany({ where: { accountId } });
  const ids = projectIds.filter((id): id is string => typeof id === "string" && Boolean(id));
  if (!ids.length) return;
  await prisma.portalAccountProject.createMany({
    data: ids.map((projectId) => ({ accountId, projectId })),
    skipDuplicates: true,
  });
}

export const portalAdminModule = new Elysia({ prefix: "/workspaces/:slug/portal-accounts" })
  .use(authPlugin)

  .get("/", async ({ params: { slug }, user }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAdmin(ws.id, user.id);
    const contas = await prisma.portalAccount.findMany({
      where: { workspaceId: ws.id, deletedAt: null },
      include: { projects: { select: { projectId: true } } },
      orderBy: { name: "asc" },
    });
    return { results: contas.map(contaAdminDto) };
  })

  .post("/", async ({ params: { slug }, body, user, set, headers }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAdmin(ws.id, user.id);
    const b = (body ?? {}) as any;
    const email = normalizarEmail(b.email);
    const senha = String(b.password ?? "");
    if (!email || !String(b.name ?? "").trim()) {
      set.status = 400;
      return { detail: "Informe nome e e-mail." };
    }
    if (senha.length < SENHA_MINIMA) {
      set.status = 400;
      return { detail: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` };
    }
    const jaExiste = await prisma.portalAccount.findFirst({ where: { workspaceId: ws.id, email, deletedAt: null } });
    if (jaExiste) {
      set.status = 409;
      return { detail: "Já existe uma conta do portal com este e-mail." };
    }
    const conta = await prisma.portalAccount.create({
      data: {
        workspaceId: ws.id,
        email,
        password: await gerarHashDeSenha(senha),
        name: String(b.name).trim(),
        entityId: b.entity_id ?? null,
      },
    });
    await definirSistemas(conta.id, b.project_ids);
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.USER,
      entityId: conta.id,
      action: AUDIT_ACTIONS.CREATE,
      actor: user,
      headers,
      metadata: { origem: "portal", email },
    });
    set.status = 201;
    const completa = await prisma.portalAccount.findFirstOrThrow({
      where: { id: conta.id },
      include: { projects: { select: { projectId: true } } },
    });
    return contaAdminDto(completa);
  })

  .patch("/:id", async ({ params: { slug, id }, body, user, set, headers }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAdmin(ws.id, user.id);
    const b = (body ?? {}) as any;
    const existente = await prisma.portalAccount.findFirst({ where: { id, workspaceId: ws.id, deletedAt: null } });
    if (!existente) {
      set.status = 404;
      return { detail: "Conta não encontrada." };
    }
    const dados: any = {};
    if (b.name !== undefined) dados.name = String(b.name).trim();
    if (b.email !== undefined) dados.email = normalizarEmail(b.email);
    if (b.entity_id !== undefined) dados.entityId = b.entity_id || null;
    if (b.is_active !== undefined) dados.isActive = Boolean(b.is_active);
    if (b.password) {
      if (String(b.password).length < SENHA_MINIMA) {
        set.status = 400;
        return { detail: `A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.` };
      }
      dados.password = await gerarHashDeSenha(String(b.password));
    }
    await prisma.portalAccount.update({ where: { id }, data: dados });
    await definirSistemas(id, b.project_ids);
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.USER,
      entityId: id,
      action: AUDIT_ACTIONS.UPDATE,
      actor: user,
      headers,
      // A senha nova nunca entra na trilha; só o fato de ter sido trocada.
      metadata: { origem: "portal", senha_trocada: Boolean(b.password) },
    });
    const completa = await prisma.portalAccount.findFirstOrThrow({
      where: { id },
      include: { projects: { select: { projectId: true } } },
    });
    return contaAdminDto(completa);
  })

  .delete("/:id", async ({ params: { slug, id }, user, set, headers }: any) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceAdmin(ws.id, user.id);
    const existente = await prisma.portalAccount.findFirst({ where: { id, workspaceId: ws.id, deletedAt: null } });
    if (!existente) {
      set.status = 404;
      return { detail: "Conta não encontrada." };
    }
    // Exclusão lógica: as solicitações que a conta abriu continuam de pé.
    await prisma.portalAccount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    recordAudit({
      workspaceId: ws.id,
      entity: AUDIT_ENTITIES.USER,
      entityId: id,
      action: AUDIT_ACTIONS.DELETE,
      actor: user,
      headers,
      metadata: { origem: "portal" },
    });
    set.status = 204;
    return null;
  });
