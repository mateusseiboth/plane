/**
 * Rotas das ferramentas do atendente e da gestão do chat (W05). Finas:
 * autenticam, conferem a ação da matriz, chamam o service e traduzem
 * `AtendenteError` por `instanceof` (status, `detail` e `errors` por campo).
 *
 *   chat.atender           frases do compositor e as próprias (com dono), chave, cadastro,
 *                          WhatsApp do responsável
 *   chat.pausar            pausar e retomar o alerta de cliente sem resposta
 *   chat.frases_do_espaco  cadastro das frases do espaço
 *   chat.configurar        feriados
 *   chat.ver_todas         gerenciador de conversas
 *   chat.relatorios        monitor ao vivo
 *
 * Caminhos completos (sem prefixo com :slug) pelo bug do Elysia 1.4 descrito em
 * config-routes.ts.
 */

import { Elysia } from "elysia";
import { resolveAttendant } from "@/auth";
import { AtendenteError, NaoAutenticadoError, SemPermissaoError } from "@/atendente/errors";
import { readFeriados, saveFeriados } from "@/atendente/feriados.service";
import { ESCOPO_DA_FRASE } from "@/atendente/frases";
import {
  createFrase,
  deleteFrase,
  listFrasesDoDono,
  listFrasesVisiveis,
  seedFrasesPadrao,
  updateFrase,
  type DonoDaFrase,
} from "@/atendente/frases.service";
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

const { ATENDER, PAUSAR, CONFIGURAR, FRASES_DO_ESPACO, VER_TODAS, RELATORIOS } = CHAT_ACTION;

const pessoal = (slug: string, userId: string): DonoDaFrase => ({ slug, escopo: ESCOPO_DA_FRASE.PESSOAL, userId });
const doEspaco = (slug: string, userId: string): DonoDaFrase => ({ slug, escopo: ESCOPO_DA_FRASE.ESPACO, userId });

export const atendenteModule = new Elysia()
  // ── Frases prontas: no compositor (as do espaço e as próprias) e as pessoais ──
  .get(
    "/workspaces/:slug/frases/",
    guarded(ATENDER, ({ params }, userId) => listFrasesVisiveis(params.slug!, userId))
  )
  .post(
    "/workspaces/:slug/frases/",
    guarded(ATENDER, ({ params, body }, userId) => createFrase(pessoal(params.slug!, userId), body), 201)
  )
  .patch(
    "/workspaces/:slug/frases/:id/",
    guarded(ATENDER, ({ params, body }, userId) => updateFrase(pessoal(params.slug!, userId), params.id!, body))
  )
  .delete(
    "/workspaces/:slug/frases/:id/",
    guarded(ATENDER, ({ params }, userId) => deleteFrase(pessoal(params.slug!, userId), params.id!))
  )
  // ── Frases do espaço (configuração) ──
  .get(
    "/workspaces/:slug/config/frases/",
    guarded(FRASES_DO_ESPACO, ({ params }, userId) => listFrasesDoDono(doEspaco(params.slug!, userId)))
  )
  .post(
    "/workspaces/:slug/config/frases/",
    guarded(FRASES_DO_ESPACO, ({ params, body }, userId) => createFrase(doEspaco(params.slug!, userId), body), 201)
  )
  .post(
    "/workspaces/:slug/config/frases/padrao/",
    guarded(FRASES_DO_ESPACO, ({ params }, userId) => seedFrasesPadrao(params.slug!, userId))
  )
  .patch(
    "/workspaces/:slug/config/frases/:id/",
    guarded(FRASES_DO_ESPACO, ({ params, body }, userId) =>
      updateFrase(doEspaco(params.slug!, userId), params.id!, body)
    )
  )
  .delete(
    "/workspaces/:slug/config/frases/:id/",
    guarded(FRASES_DO_ESPACO, ({ params }, userId) => deleteFrase(doEspaco(params.slug!, userId), params.id!))
  )

  // ── Feriados (aba Horários) ──
  .get(
    "/workspaces/:slug/config/feriados/",
    guarded(ATENDER, ({ params }) => readFeriados(params.slug!))
  )
  .put(
    "/workspaces/:slug/config/feriados/",
    guarded(CONFIGURAR, ({ params, body }) => saveFeriados(params.slug!, body))
  )

  // ── Na conversa ──
  .post(
    "/workspaces/:slug/sessions/:id/chave/",
    guarded(ATENDER, ({ params, body }, userId) => sendChave(params.slug!, params.id!, userId, body), 201)
  )
  .post(
    "/workspaces/:slug/sessions/:id/sla-alert/pause/",
    guarded(PAUSAR, ({ params }) => changeAlerta(params.slug!, params.id!, true))
  )
  .post(
    "/workspaces/:slug/sessions/:id/sla-alert/resume/",
    guarded(PAUSAR, ({ params }) => changeAlerta(params.slug!, params.id!, false))
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
    guarded(VER_TODAS, ({ params, query }) => listGerenciador(params.slug!, (query ?? {}) as Consulta))
  )
  .get(
    "/workspaces/:slug/monitor/",
    guarded(RELATORIOS, ({ params }) => readMonitor(params.slug!))
  );
