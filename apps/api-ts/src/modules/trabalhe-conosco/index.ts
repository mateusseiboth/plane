/**
 * Inscrição pública de currículo: `/trabalhe-conosco?workspace=<slug>`.
 *
 * Rota PÚBLICA, fora do `/api/v1` (o `authPlugin` de lá é global): quem chega
 * aqui não tem conta e não deve poder virar usuário. O espaço decide se recebe
 * (`curriculo_config.site_enabled`, ligado na tela de Currículos por quem tem
 * `curriculo.read`).
 *
 * Contra robô: limite por IP e campo isca. A resposta é a mesma para robô e
 * para gente, e nunca conta se o e-mail já mandou currículo antes.
 */
import { Elysia } from "elysia";
import { curriculoService } from "@modules/curriculo";
import { isRoboNaIsca } from "@modules/curriculo/curriculo.rules";
import { espacoPeloSlug } from "@modules/portal/conta";
import { paginaTrabalheConosco } from "@modules/trabalhe-conosco/pagina";
import { checkRateLimit } from "@utils/rate-limiter";

/** Envios por IP a cada hora. O currículo é um por pessoa; 5 já é folga. */
const ENVIOS = { max: 5, janelaMs: 60 * 60_000 };
/** Teto do corpo: o PDF vai até 10 MB, o resto é folga do multipart. */
const TETO_DO_CORPO = 12 * 1024 * 1024;

const RECEBIDO = { detail: "Currículo recebido. Obrigado pelo interesse." };
const FECHADO = "As inscrições estão fechadas no momento.";

type Headers = Record<string, string | undefined>;

const ipDaRequisicao = (headers: Headers): string =>
  (headers["x-forwarded-for"] ?? "").split(",")[0]?.trim() || headers["x-real-ip"] || "desconhecido";

const slugDaQuery = (query: unknown) => String((query as Record<string, unknown>)?.workspace ?? "").trim();

/** Espaço do pedido com a configuração já resolvida. `null` = espaço inexistente. */
async function espacoDaInscricao(slug: string) {
  const espaco = await espacoPeloSlug(slug);
  if (!espaco) return null;
  const config = await curriculoService.readConfig(espaco.id);
  return { ...espaco, ...config };
}

export const trabalheConoscoModule = new Elysia({ prefix: "/trabalhe-conosco" })
  /**
   * Corta o upload gigante ANTES de a API ler o corpo: num endereço público,
   * mandar 500 MB é o ataque mais barato que existe.
   */
  .onRequest(({ request, set }) => {
    const tamanho = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isFinite(tamanho) || tamanho <= TETO_DO_CORPO) return;
    set.status = 413;
    return { detail: "O arquivo passa do limite aceito. Envie um PDF de até 10 MB." };
  })

  // ── A página ───────────────────────────────────────────────────────────────
  .get("/", async ({ query, set }) => {
    const slug = slugDaQuery(query);
    const espaco = await espacoDaInscricao(slug);
    set.headers["content-type"] = "text/html; charset=utf-8";
    return paginaTrabalheConosco({
      nome: espaco?.name ?? "Trabalhe conosco",
      workspace: slug,
      isAberto: espaco?.site_enabled === true,
      retencaoDias: espaco?.retention_days ?? 365,
    });
  })

  // ── Situação, para quem quiser montar o link em outro lugar ────────────────
  .get("/api/config", async ({ query }) => {
    const espaco = await espacoDaInscricao(slugDaQuery(query));
    return { nome: espaco?.name ?? "Trabalhe conosco", aberto: espaco?.site_enabled === true };
  })

  // ── O envio ────────────────────────────────────────────────────────────────
  .post("/api/inscricao", async ({ query, headers, body, set }) => {
    const espaco = await espacoDaInscricao(slugDaQuery(query));
    if (!espaco?.site_enabled) {
      set.status = 403;
      return { detail: FECHADO };
    }
    if (!checkRateLimit(`curriculo-site:${ipDaRequisicao(headers as Headers)}`, ENVIOS.max, ENVIOS.janelaMs)) {
      set.status = 429;
      return { detail: "Muitos envios deste computador. Tente de novo mais tarde." };
    }
    const campos = (body ?? {}) as Record<string, unknown>;
    set.status = 201;
    // Robô recebe a mesma resposta de quem preencheu direito: dizer "recusado"
    // ensina o robô a tentar de novo sem a isca.
    if (isRoboNaIsca(campos)) return RECEBIDO;

    const arquivo = campos.file;
    const pdf = arquivo instanceof Blob ? arquivo : null;
    const nome = arquivo instanceof File ? arquivo.name : "curriculo.pdf";
    await curriculoService.createDoSite(espaco.id, campos, pdf, nome);
    return RECEBIDO;
  });
