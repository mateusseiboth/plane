/**
 * Rotas das ferramentas do atendente e da gestão do chat (W05). Finas:
 * autenticam, conferem a ação da matriz, chamam o service e traduzem
 * `AtendenteError` por `instanceof` (status, `detail` e `errors` por campo).
 *
 *   chat.atender      frases (leitura), chave, alerta, cadastro, WhatsApp do responsável
 *   chat.administrar  cadastro de frases e feriados
 *   chat.gerenciar    gerenciador de conversas e monitor ao vivo
 *
 * Caminhos completos (sem prefixo com :slug) pelo bug do Elysia 1.4 descrito em
 * config-routes.ts.
 */

import { Elysia } from "elysia";
import { resolveAttendant } from "@/auth";
import { AtendenteError, NaoAutenticadoError, SemPermissaoError } from "@/atendente/errors";
import { readFeriados, saveFeriados } from "@/atendente/feriados.service";
import { createFrase, deleteFrase, listFrases, seedFrasesPadrao, updateFrase } from "@/atendente/frases.service";
import { listGerenciador } from "@/atendente/gerenciador.service";
import { readMonitor } from "@/atendente/monitor.service";
import { changeAlerta, readCadastro, sendChave, updateCadastro } from "@/atendente/sessao.service";
import { startWhatsappDoResponsavel } from "@/atendente/whatsapp-do-responsavel.service";
import { CHAT_ACTION, hasChatAction, type ChatAction } from "@/permissoes";

type Set = { status?: number | string };
type Consulta = Record<string, string | undefined>;

async function requireAction(slug: string, headers: unknown, action: ChatAction): Promise<string> {
  const user = await resolveAttendant(headers);
  if (!user) throw new NaoAutenticadoError();
  if (!(await hasChatAction(slug, user.id, action))) throw new SemPermissaoError();
  return user.id;
}

async function respond<T>(set: Set, fn: () => Promise<T>, okStatus?: number) {
  try {
    const body = await fn();
    if (okStatus) set.status = okStatus;
    return body;
  } catch (e) {
    if (!(e instanceof AtendenteError)) throw e;
    set.status = e.status;
    return { detail: e.message, ...(e.errors.length ? { errors: e.errors } : {}), ...e.extra };
  }
}

type Ctx = { params: Record<string, string>; headers: unknown; body: unknown; query: unknown; set: Set };

/** Rota que exige `action` e chama `fn` com o id de quem pediu. */
const guarded =
  <T>(action: ChatAction, fn: (ctx: Ctx, userId: string) => Promise<T>, okStatus?: number) =>
  (ctx: Ctx) =>
    respond(ctx.set, async () => fn(ctx, await requireAction(ctx.params.slug!, ctx.headers, action)), okStatus);

const { ATENDER, ADMINISTRAR, GERENCIAR } = CHAT_ACTION;

export const atendenteModule = new Elysia()
  // ── Frases prontas ──
  .get(
    "/workspaces/:slug/frases/",
    guarded(ATENDER, ({ params }) => listFrases(params.slug!))
  )
  .get(
    "/workspaces/:slug/config/frases/",
    guarded(ADMINISTRAR, ({ params }) => listFrases(params.slug!))
  )
  .post(
    "/workspaces/:slug/config/frases/",
    guarded(ADMINISTRAR, ({ params, body }) => createFrase(params.slug!, body), 201)
  )
  .post(
    "/workspaces/:slug/config/frases/padrao/",
    guarded(ADMINISTRAR, ({ params }) => seedFrasesPadrao(params.slug!))
  )
  .patch(
    "/workspaces/:slug/config/frases/:id/",
    guarded(ADMINISTRAR, ({ params, body }) => updateFrase(params.slug!, params.id!, body))
  )
  .delete(
    "/workspaces/:slug/config/frases/:id/",
    guarded(ADMINISTRAR, ({ params }) => deleteFrase(params.slug!, params.id!))
  )

  // ── Feriados (aba Horários) ──
  .get(
    "/workspaces/:slug/config/feriados/",
    guarded(ATENDER, ({ params }) => readFeriados(params.slug!))
  )
  .put(
    "/workspaces/:slug/config/feriados/",
    guarded(ADMINISTRAR, ({ params, body }) => saveFeriados(params.slug!, body))
  )

  // ── Na conversa ──
  .post(
    "/workspaces/:slug/sessions/:id/chave/",
    guarded(ATENDER, ({ params, body }, userId) => sendChave(params.slug!, params.id!, userId, body), 201)
  )
  .post(
    "/workspaces/:slug/sessions/:id/sla-alert/pause/",
    guarded(ATENDER, ({ params }) => changeAlerta(params.slug!, params.id!, true))
  )
  .post(
    "/workspaces/:slug/sessions/:id/sla-alert/resume/",
    guarded(ATENDER, ({ params }) => changeAlerta(params.slug!, params.id!, false))
  )
  .get(
    "/workspaces/:slug/sessions/:id/cadastro/",
    guarded(ATENDER, ({ params }) => readCadastro(params.slug!, params.id!))
  )
  .patch(
    "/workspaces/:slug/sessions/:id/cadastro/",
    guarded(ATENDER, ({ params, body }) => updateCadastro(params.slug!, params.id!, body))
  )
  .post(
    "/workspaces/:slug/sessions/whatsapp/responsavel/",
    guarded(ATENDER, ({ params, body }, userId) => startWhatsappDoResponsavel(params.slug!, userId, body), 201)
  )

  // ── Gestão ──
  .get(
    "/workspaces/:slug/gerenciador/",
    guarded(GERENCIAR, ({ params, query }) => listGerenciador(params.slug!, (query ?? {}) as Consulta))
  )
  .get(
    "/workspaces/:slug/monitor/",
    guarded(GERENCIAR, ({ params }) => readMonitor(params.slug!))
  );
