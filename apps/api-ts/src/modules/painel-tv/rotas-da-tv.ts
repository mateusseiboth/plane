/**
 * As rotas que a TV lê: só leitura, escopadas ao espaço, fora do `authPlugin`.
 *
 * Duas portas de entrada, nesta ordem:
 *  1. **chave de painel** (`X-Panel-Key`, ou `?key=` porque a TV só sabe abrir
 *     uma URL) — abre sem login nenhum, dentro do escopo gravado na chave;
 *  2. **sessão do Plane** — quem já está logado e pode ver relatórios
 *     (`report.view`) abre o painel sem chave nenhuma.
 *
 * Sem chave e sem sessão é 401; com sessão sem a ação é 403; com chave fora do
 * escopo é 403. Nada aqui escreve.
 *
 * Montadas ANTES do `apiApp` em `src/index.ts`: o `authPlugin` de lá é global e
 * passaria a exigir usuário logado de toda rota registrada depois dele.
 */

import { Elysia } from "elysia";
import { resolveUsuarioOpcional } from "@middleware/auth";
import { clientIp } from "@utils/audit";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
import { checkRateLimit } from "@utils/rate-limiter";
import { subscribeRealtime, type RealtimeEvent } from "@utils/realtime";
import { getWorkspaceOrFail } from "@utils/workspace";
import { parseFilters } from "@modules/reports/comum/filtros";
import { findPainelDeAtendimento } from "@modules/painel-tv/atendimento/atendimento.service";
import { isPainelDaChave, readChaveDaRequisicao, type PainelDaChave } from "@modules/painel-tv/chaves/chave";
import { chaveDao } from "@modules/painel-tv/chaves/chave.dao";
import { ChaveDePainelInvalidaError, PainelDesconhecidoError } from "@modules/painel-tv/chaves/chave.errors";
import { createChaveService } from "@modules/painel-tv/chaves/chave.service";
import { findPainelDeBackups, readDiasDoPainel } from "@modules/painel-tv/backups/backups.service";
import { findMapa } from "@modules/painel-tv/mapa/mapa.service";
import { isPainelDoQuadro } from "@modules/painel-tv/quadro/colunas";
import { findQuadro } from "@modules/painel-tv/quadro/quadro.service";
import { recordAudit } from "@utils/audit";

const service = createChaveService({
  dao: chaveDao,
  audit: recordAudit,
  now: () => new Date(),
  rateLimit: checkRateLimit,
});

type Cabecalhos = Record<string, string | undefined>;
type Consulta = Record<string, unknown>;

type Contexto = {
  params: Record<string, string>;
  headers: Cabecalhos;
  query: Consulta;
  request: Request;
};

type Acesso = { workspaceId: string; slug: string; nome: string; via: "chave" | "sessao"; chave: string | null };

/**
 * Quem está pedindo o painel: a chave, ou a sessão de quem está logado. A ordem
 * importa — a TV manda a chave em toda requisição e não tem sessão nenhuma.
 */
async function requirePainel(ctx: Contexto, painel: PainelDaChave | null): Promise<Acesso> {
  const ws = await getWorkspaceOrFail(ctx.params.slug!);
  const valor = readChaveDaRequisicao(ctx.headers, ctx.query);

  if (valor) {
    const chave = await service.authenticate({
      valor,
      painel,
      workspaceId: ws.id,
      ip: clientIp(ctx.headers) ?? "desconhecido",
    });
    return { workspaceId: ws.id, slug: ws.slug, nome: ws.name, via: "chave", chave: chave.name };
  }

  const user = await resolveUsuarioOpcional(ctx.headers, ctx.request);
  if (!user) throw new ChaveDePainelInvalidaError();
  await requireWorkspaceAction(ws.id, user.id, EProjectAction.REPORT_VIEW);
  return { workspaceId: ws.id, slug: ws.slug, nome: ws.name, via: "sessao", chave: null };
}

const requireQuadro = (valor: unknown) => {
  if (isPainelDoQuadro(valor)) return valor;
  throw new PainelDesconhecidoError();
};

/** SSE com a mesma porta de entrada das demais rotas: chave ou sessão. */
function streamDoPainel(workspaceId: string, request: Request): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enviar = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // conexão já fechada — a limpeza abaixo cuida do resto
        }
      };
      enviar(`: connected ${Date.now()}\n\n`);
      enviar(`retry: 5000\n\n`);

      const cancelar = subscribeRealtime(workspaceId, (evento: RealtimeEvent) => {
        // O painel só recarrega por causa de chamado e solicitação; mandar o
        // resto faria a TV refazer as consultas a cada comentário.
        if (evento.entity !== "issue" && evento.entity !== "intake") return;
        enviar(`data: ${JSON.stringify({ entity: evento.entity, action: evento.action, ts: evento.ts })}\n\n`);
      });
      const batida = setInterval(() => enviar(`: ping\n\n`), 25_000);

      const limpar = () => {
        clearInterval(batida);
        cancelar();
        try {
          controller.close();
        } catch {
          // já fechado
        }
      };
      request.signal.addEventListener("abort", limpar);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const painelDaTvModule = new Elysia({ prefix: "/api/v1/tv/:slug" })
  // Quem é este painel: o nome do espaço e o que a chave abre. É o que a página
  // chama ao carregar, antes de saber qual painel mostrar.
  .get("/me/", async (ctx) => {
    const acesso = await requirePainel(ctx as Contexto, null);
    return {
      workspace: { slug: acesso.slug, name: acesso.nome },
      via: acesso.via,
      chave: acesso.chave,
    };
  })

  .get("/quadro/:painel/", async (ctx) => {
    const painel = requireQuadro((ctx as Contexto).params.painel);
    const acesso = await requirePainel(ctx as Contexto, painel);
    return findQuadro(acesso.workspaceId, painel, parseFilters((ctx as Contexto).query));
  })

  .get("/atendimento/", async (ctx) => {
    const acesso = await requirePainel(ctx as Contexto, "atendimento");
    return findPainelDeAtendimento(acesso.slug);
  })

  .get("/mapa/", async (ctx) => {
    const acesso = await requirePainel(ctx as Contexto, "mapa");
    return findMapa(acesso.workspaceId);
  })

  .get("/backups/", async (ctx) => {
    const { query } = ctx as Contexto;
    const acesso = await requirePainel(ctx as Contexto, "backups");
    return findPainelDeBackups(acesso.workspaceId, {
      uf: typeof query.uf === "string" ? query.uf : null,
      dias: readDiasDoPainel(query.dias),
    });
  })

  .get("/stream/", async (ctx) => {
    const acesso = await requirePainel(ctx as Contexto, null);
    return streamDoPainel(acesso.workspaceId, (ctx as Contexto).request);
  });

/** Painéis que a página conhece (a rota `/quadro/:painel/` só aceita estes dois). */
export const isPainelConhecido = isPainelDaChave;
