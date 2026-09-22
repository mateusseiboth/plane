/**
 * Gestão dos painéis de TV em Configurações do espaço: chaves de API (criar,
 * listar, revogar) e o mapeamento das colunas de cada painel.
 *
 * Rotas finas: conferem `panel.manage` na matriz de ações, chamam o service e
 * traduzem o erro tipado por `instanceof`. A criação e a revogação entram na
 * trilha de auditoria (é credencial de acesso a dados do espaço).
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { recordAudit } from "@utils/audit";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { checkRateLimit } from "@utils/rate-limiter";
import { getWorkspaceOrFail } from "@utils/workspace";
import { chaveDao } from "@modules/painel-tv/chaves/chave.dao";
import { PainelError, ValidacaoDasColunasError } from "@modules/painel-tv/chaves/chave.errors";
import { createChaveService, type ChaveContexto } from "@modules/painel-tv/chaves/chave.service";
import {
  COLUNAS_PADRAO,
  parseColunasDoPainel,
  readColunasDoPainel,
  isPainelDoQuadro,
  type PainelDoQuadro,
} from "@modules/painel-tv/quadro/colunas";
import { PainelDesconhecidoError } from "@modules/painel-tv/chaves/chave.errors";

const service = createChaveService({
  dao: chaveDao,
  audit: recordAudit,
  now: () => new Date(),
  rateLimit: checkRateLimit,
});

type Set = { status?: number | string };

async function requireGestao(slug: string, userId: string, headers: unknown): Promise<ChaveContexto> {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceAction(ws.id, userId, EProjectAction.PANEL_MANAGE);
  return { workspaceId: ws.id, slug, userId, headers: headers as Record<string, string | undefined> };
}

/** Erro tipado vira `{detail, errors?}` com o status dele; o resto sobe. */
async function respond<T>(set: Set, executar: () => Promise<T>, okStatus?: number) {
  try {
    const corpo = await executar();
    if (okStatus) set.status = okStatus;
    return corpo;
  } catch (erro) {
    if (!(erro instanceof PainelError)) throw erro;
    set.status = erro.status;
    const errors = (erro as { errors?: { path: string; message: string }[] }).errors;
    return { detail: erro.message, ...(errors?.length ? { errors } : {}) };
  }
}

const requirePainelDoQuadro = (valor: unknown): PainelDoQuadro => {
  if (isPainelDoQuadro(valor)) return valor;
  throw new PainelDesconhecidoError();
};

/** Nomes das etapas do espaço, para a tela montar as colunas sem digitar. */
async function findEtapasDoEspaco(workspaceId: string): Promise<string[]> {
  const etapas = await prisma.state.findMany({
    where: { workspaceId, deletedAt: null },
    select: { name: true },
    distinct: ["name"],
    orderBy: { sequence: "asc" },
  });
  return etapas.map((e) => e.name);
}

async function readColunas(workspaceId: string, painel: PainelDoQuadro) {
  const [config, etapas] = await Promise.all([
    chaveDao.findConfig(workspaceId, painel),
    findEtapasDoEspaco(workspaceId),
  ]);
  const columns = readColunasDoPainel(painel, config?.columns ?? null);
  // Identidade, não conteúdo: `readColunasDoPainel` devolve o PRÓPRIO padrão
  // quando não há configuração válida gravada.
  return { painel, columns, is_default: columns === COLUNAS_PADRAO[painel], etapas_do_espaco: etapas };
}

export const painelDeTvModule = new Elysia({ prefix: "/workspaces/:slug/tv-panels" })
  .use(authPlugin)

  .get("/keys/", async ({ params: { slug }, user, set }) =>
    respond(set, async () => service.list(await requireGestao(slug, user.id, undefined)))
  )

  .post("/keys/", async ({ params: { slug }, user, body, headers, set }) =>
    respond(
      set,
      async () => service.create(await requireGestao(slug, user.id, headers), (body ?? {}) as Record<string, unknown>),
      201
    )
  )

  .post("/keys/:id/revoke/", async ({ params: { slug, id }, user, headers, set }) =>
    respond(set, async () => service.revoke(await requireGestao(slug, user.id, headers), id))
  )

  .get("/columns/:painel/", async ({ params: { slug, painel }, user, set }) =>
    respond(set, async () => {
      const ctx = await requireGestao(slug, user.id, undefined);
      return readColunas(ctx.workspaceId, requirePainelDoQuadro(painel));
    })
  )

  .put("/columns/:painel/", async ({ params: { slug, painel }, user, body, set }) =>
    respond(set, async () => {
      const ctx = await requireGestao(slug, user.id, undefined);
      const doPainel = requirePainelDoQuadro(painel);
      const { colunas, erros } = parseColunasDoPainel((body as { columns?: unknown } | null)?.columns);
      if (erros.length) throw new ValidacaoDasColunasError(erros);
      await chaveDao.saveConfig(ctx.workspaceId, doPainel, colunas as never, ctx.userId);
      return readColunas(ctx.workspaceId, doPainel);
    })
  )

  /** Volta ao mapeamento padrão do código. */
  .delete("/columns/:painel/", async ({ params: { slug, painel }, user, set }) =>
    respond(set, async () => {
      const ctx = await requireGestao(slug, user.id, undefined);
      const doPainel = requirePainelDoQuadro(painel);
      await chaveDao.deleteConfig(ctx.workspaceId, doPainel);
      return readColunas(ctx.workspaceId, doPainel);
    })
  );
