/**
 * Rotas das ligações do FreePBX. Finas: autenticam, checam a ação da matriz,
 * chamam o service e traduzem `LigacaoError` por `instanceof`.
 *
 *   PBX (token de serviço)   POST /workspaces/:slug/telefonia/ligacoes/
 *   chat.administrar         /workspaces/:slug/config/telefonia/...
 *   chat.atender             /workspaces/:slug/ligacoes/:id/...  e o histórico do cliente
 *   chat.gerenciar           GET /workspaces/:slug/reports/ligacoes/
 *
 * Caminhos completos (sem prefixo com :slug) pelo mesmo bug do Elysia 1.4
 * descrito em config-routes.ts.
 */

import { Elysia } from "elysia";
import { resolveAttendant, type PlaneUser } from "@/auth";
import { LigacaoError, NaoAutenticadoError, SemPermissaoError } from "@/ligacoes/errors";
import {
  assumeLigacao,
  concludeLigacao,
  linkChamado,
  readHistoricoDoCliente,
  readLigacaoDetalhe,
  readRelatorioDeLigacoes,
  registerLigacao,
} from "@/ligacoes/ligacoes.service";
import {
  generateTelefoniaToken,
  readTelefoniaConfig,
  revokeTelefoniaToken,
  saveRamais,
} from "@/ligacoes/telefonia-config.service";
import { CHAT_ACTION, hasChatAction, type ChatAction } from "@/permissoes";

type Headers = Record<string, string | undefined>;
type Set = { status?: number | string };

async function requireAction(slug: string, headers: Headers, action: ChatAction): Promise<PlaneUser> {
  const user = await resolveAttendant(headers);
  if (!user) throw new NaoAutenticadoError();
  if (!(await hasChatAction(slug, user.id, action))) throw new SemPermissaoError();
  return user;
}

/** `okStatus` omitido: vale o que o handler definiu (ou o 200 do Elysia). */
async function respond<T>(set: Set, fn: () => Promise<T>, okStatus?: number) {
  try {
    const body = await fn();
    if (okStatus) set.status = okStatus;
    return body;
  } catch (e) {
    if (!(e instanceof LigacaoError)) throw e;
    set.status = e.status;
    return { detail: e.message, ...(e.errors.length ? { errors: e.errors } : {}) };
  }
}

const MAX_DIAS = 365;
const readDays = (raw: unknown) => Math.min(MAX_DIAS, Math.max(1, Number(raw) || 30));

export const ligacoesModule = new Elysia()
  // ── Entrada do PBX ──
  .post("/workspaces/:slug/telefonia/ligacoes/", ({ params: { slug }, headers, body, set }) =>
    respond(set, async () => {
      const registro = await registerLigacao(slug, headers, body);
      set.status = registro.status;
      return registro.body;
    })
  )

  // ── Configuração (chat.administrar) ──
  .get("/workspaces/:slug/config/telefonia/", ({ params: { slug }, headers, set }) =>
    respond(set, async () => {
      await requireAction(slug, headers, CHAT_ACTION.ADMINISTRAR);
      return readTelefoniaConfig(slug);
    })
  )
  .post("/workspaces/:slug/config/telefonia/token/", ({ params: { slug }, headers, set }) =>
    respond(
      set,
      async () => {
        const user = await requireAction(slug, headers, CHAT_ACTION.ADMINISTRAR);
        return generateTelefoniaToken(slug, user.id);
      },
      201
    )
  )
  .delete("/workspaces/:slug/config/telefonia/token/", ({ params: { slug }, headers, set }) =>
    respond(set, async () => {
      const user = await requireAction(slug, headers, CHAT_ACTION.ADMINISTRAR);
      return revokeTelefoniaToken(slug, user.id);
    })
  )
  .put("/workspaces/:slug/config/telefonia/ramais/", ({ params: { slug }, headers, body, set }) =>
    respond(set, async () => {
      await requireAction(slug, headers, CHAT_ACTION.ADMINISTRAR);
      return saveRamais(slug, body);
    })
  )

  // ── Atendente (chat.atender) ──
  .get("/workspaces/:slug/ligacoes/:id/", ({ params: { slug, id }, headers, set }) =>
    respond(set, async () => readLigacaoDetalhe(slug, id, await requireAction(slug, headers, CHAT_ACTION.ATENDER)))
  )
  .post("/workspaces/:slug/ligacoes/:id/assumir/", ({ params: { slug, id }, headers, set }) =>
    respond(set, async () => assumeLigacao(slug, id, await requireAction(slug, headers, CHAT_ACTION.ATENDER)))
  )
  .post("/workspaces/:slug/ligacoes/:id/concluir/", ({ params: { slug, id }, headers, body, set }) =>
    respond(set, async () => concludeLigacao(slug, id, await requireAction(slug, headers, CHAT_ACTION.ATENDER), body))
  )
  .post("/workspaces/:slug/ligacoes/:id/chamado/", ({ params: { slug, id }, headers, body, set }) =>
    respond(set, async () => linkChamado(slug, id, await requireAction(slug, headers, CHAT_ACTION.ATENDER), body))
  )
  .get("/workspaces/:slug/sessions/:id/historico-do-cliente/", ({ params: { slug, id }, headers, set }) =>
    respond(set, async () => {
      await requireAction(slug, headers, CHAT_ACTION.ATENDER);
      return readHistoricoDoCliente(slug, id);
    })
  )

  // ── Relatório (chat.gerenciar) ──
  .get("/workspaces/:slug/reports/ligacoes/", ({ params: { slug }, query, headers, set }) =>
    respond(set, async () => {
      await requireAction(slug, headers, CHAT_ACTION.GERENCIAR);
      return readRelatorioDeLigacoes(slug, readDays((query as Record<string, unknown>)?.days));
    })
  );
