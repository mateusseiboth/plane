/**
 * Rotas internas que o robô do chat chama (sem usuário logado): ouvidoria,
 * currículo e troca do e-mail do responsável. Autenticação de SERVIÇO pelo
 * cabeçalho `X-Service-Token` (`CHAT_SERVICE_TOKEN`); sem o token configurado
 * as rotas respondem 503.
 *
 * Ficam FORA do `/api/v1`: o `authPlugin` de lá é global e exigiria um usuário.
 * O proxy público reescreve `/api/*` para `/api/v1/*`, então este caminho só é
 * alcançado pela rede interna (o chat fala direto com `api-ts:8001`).
 */
import { Elysia } from "elysia";
import { curriculoService } from "@modules/curriculo";
import { createResponsavelEmailService, responsavelEmailDao } from "@modules/interno-chat/responsavel-email";
import { ouvidoriaService } from "@modules/ouvidoria";
import { recordAudit } from "@utils/audit";
import { readServiceToken, requireServiceToken } from "@utils/servico-interno";
import { getWorkspaceOrFail } from "@utils/workspace";

const responsavelEmail = createResponsavelEmailService({ dao: responsavelEmailDao, audit: recordAudit });

type Headers = Record<string, string | undefined>;

async function serviceWorkspace(headers: Headers, slug: string) {
  requireServiceToken(headers, readServiceToken());
  return getWorkspaceOrFail(slug);
}

/** Campos de texto do multipart (o arquivo vem à parte). */
const readCampos = (body: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(body).filter(([, valor]) => typeof valor === "string"));

export const internoChatModule = new Elysia({ prefix: "/api/internal/chat/workspaces/:slug" })
  .post("/ouvidoria/", async ({ params: { slug }, headers, body, set }) => {
    const ws = await serviceWorkspace(headers, slug);
    set.status = 201;
    return ouvidoriaService.create(ws.id, (body ?? {}) as Record<string, unknown>);
  })

  .post("/curriculos/", async ({ params: { slug }, headers, body, set }) => {
    const ws = await serviceWorkspace(headers, slug);
    const campos = (body ?? {}) as Record<string, unknown>;
    const arquivo = campos.file;
    const pdf = arquivo instanceof Blob ? arquivo : null;
    const nome = arquivo instanceof File ? arquivo.name : "curriculo.pdf";
    const criado = await curriculoService.create(ws.id, readCampos(campos), pdf, nome);
    set.status = 201;
    return criado;
  })

  .post("/responsavel-email/", async ({ params: { slug }, headers, body }) => {
    const ws = await serviceWorkspace(headers, slug);
    return responsavelEmail.update(ws.id, (body ?? {}) as Record<string, unknown>);
  });
