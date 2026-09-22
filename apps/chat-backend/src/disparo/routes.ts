/**
 * Rotas do disparo em massa. Finas: conferem `chat.disparo` (todas), chamam o
 * service e traduzem `DisparoError` por `instanceof`.
 *
 *   /workspaces/:slug/disparo/mensagens/            cadastro (multipart: titulo, texto, arquivo)
 *   /workspaces/:slug/disparo/previa/               quantos recebem com os filtros
 *   /workspaces/:slug/disparo/mensagens/:id/enviar/ enfileira (o worker envia)
 *   /workspaces/:slug/disparo/mensagens/:id/status/ imagem no Status do WhatsApp
 *   /workspaces/:slug/disparo/execucoes/            histórico e detalhe por telefone
 *   /workspaces/:slug/disparo/fila-zapi/            fila de saída da Z-API
 *   /workspaces/:slug/disparo/config/               mensagens por minuto
 *
 * Caminhos completos (sem prefixo com :slug) pelo mesmo bug do Elysia 1.4
 * descrito em config-routes.ts.
 */

import { Elysia } from "elysia";
import { DisparoError } from "@/disparo/erros";
import { requireDisparo } from "@/disparo/permissao";
import {
  cancelEnvio,
  createMensagem,
  deleteMensagem,
  readConfig,
  readExecucaoDetalhe,
  readExecucoes,
  readFilaZapi,
  readMensagens,
  readPrevia,
  saveRitmo,
  sendMensagem,
  sendStatus,
  updateMensagem,
} from "@/disparo/service";

type Set = { status?: number | string };

/** `okStatus` omitido: vale o 200 do Elysia. */
async function respond<T>(set: Set, fn: () => Promise<T>, okStatus?: number) {
  try {
    const body = await fn();
    if (okStatus) set.status = okStatus;
    return body;
  } catch (e) {
    if (!(e instanceof DisparoError)) throw e;
    set.status = e.status;
    return { detail: e.message, ...(e.errors.length ? { errors: e.errors } : {}) };
  }
}

const BASE = "/workspaces/:slug/disparo";

export const disparoModule = new Elysia()
  // ── Mensagens ──
  .get(`${BASE}/mensagens/`, ({ params: { slug }, headers, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return readMensagens(slug);
    })
  )
  .post(`${BASE}/mensagens/`, ({ params: { slug }, headers, body, set }) =>
    respond(set, async () => createMensagem(slug, await requireDisparo(slug, headers), body), 201)
  )
  .patch(`${BASE}/mensagens/:id/`, ({ params: { slug, id }, headers, body, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return updateMensagem(slug, id, body);
    })
  )
  .delete(`${BASE}/mensagens/:id/`, ({ params: { slug, id }, headers, set }) =>
    respond(
      set,
      async () => {
        await requireDisparo(slug, headers);
        await deleteMensagem(slug, id);
        return null;
      },
      204
    )
  )

  // ── Prévia e envio ──
  .post(`${BASE}/previa/`, ({ params: { slug }, headers, body, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return readPrevia(slug, body);
    })
  )
  .post(`${BASE}/mensagens/:id/enviar/`, ({ params: { slug, id }, headers, body, set }) =>
    respond(set, async () => sendMensagem(slug, id, await requireDisparo(slug, headers), body, headers), 201)
  )
  .post(`${BASE}/mensagens/:id/status/`, ({ params: { slug, id }, headers, set }) =>
    respond(set, async () => sendStatus(slug, id, await requireDisparo(slug, headers), headers))
  )

  // ── Histórico ──
  .get(`${BASE}/execucoes/`, ({ params: { slug }, headers, query, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return readExecucoes(slug, query);
    })
  )
  .get(`${BASE}/execucoes/:id/`, ({ params: { slug, id }, headers, query, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return readExecucaoDetalhe(slug, id, query);
    })
  )
  .post(`${BASE}/execucoes/:id/cancelar/`, ({ params: { slug, id }, headers, set }) =>
    respond(set, async () => cancelEnvio(slug, id, await requireDisparo(slug, headers), headers))
  )

  // ── Fila da Z-API e configuração ──
  .get(`${BASE}/fila-zapi/`, ({ params: { slug }, headers, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return readFilaZapi(slug);
    })
  )
  .get(`${BASE}/config/`, ({ params: { slug }, headers, set }) =>
    respond(set, async () => {
      await requireDisparo(slug, headers);
      return readConfig(slug);
    })
  )
  .put(`${BASE}/config/`, ({ params: { slug }, headers, body, set }) =>
    respond(set, async () => saveRitmo(slug, await requireDisparo(slug, headers), body))
  );
