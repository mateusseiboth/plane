/**
 * `GET  /workspaces/:slug/bancos/:nivel/` (meses, sistemas, entidades, arquivos)
 * `POST /workspaces/:slug/projects/:project_id/bancos/:envio/preparar/`
 * `GET  /workspaces/:slug/projects/:project_id/bancos/preparar/:preparacao_id/`
 *
 * O botão do banco anexado no texto (testes da nova intranet 3, 19/11/2026):
 * quem vê o sistema baixa o backup que está anexado num chamado ou comentário
 * dele. O Plane pede ao plugin de backups um link novo a cada clique (o do
 * servidor expira de hora em hora) e devolve a preparação para a tela
 * acompanhar até `pronto`. Regras em ./banco-anexo.rules.
 */
import { Elysia } from "elysia";
import { authPlugin } from "@middleware/auth";
import {
  MENSAGEM_NAO_ANEXADO,
  MENSAGEM_SEM_PLUGIN,
  NIVEIS_DA_BUSCA,
  MENSAGEM_MES_ANTIGO,
  addNomesDasEntidades,
  filterMesesRecentes,
  isMesPermitido,
  pickParametros,
  readEnvio,
} from "@modules/banco-anexo/banco-anexo.rules";
import {
  findNomesPorCodigoDoSac,
  findPluginDeBackups,
  isEnvioAnexadoNoSistema,
  readBusca,
  readPreparacao,
  sendPreparacao,
} from "@modules/banco-anexo/banco-anexo.service";
import type { RespostaDoPlugin } from "@modules/plugin-sdk-gateway/backend-do-plugin";
import { createFieldError } from "@utils/field-error";
import { getProjectOrFail, getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

const responder = async (envio: RespostaDoPlugin, set: { status?: number | string }) => {
  if (!envio.ok) {
    set.status = envio.status;
    return { detail: envio.detail };
  }
  set.status = envio.resposta.status;
  return envio.resposta.json().catch(() => ({ detail: "Resposta inválida do gerenciador de backups." }));
};

/**
 * A busca para anexar: qualquer membro do espaço (quem vê o chamado baixa o que
 * estiver anexado, então quem escreve no chamado pode escolher o que anexar).
 */
const buscaModule = new Elysia({ prefix: "/workspaces/:slug/bancos" })
  .use(authPlugin)
  .get("/:nivel/", async ({ params: { slug, nivel }, query, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);
    const definicao = NIVEIS_DA_BUSCA[nivel];
    if (!definicao) {
      set.status = 404;
      return { detail: "Não encontrado." };
    }
    const plugin = await findPluginDeBackups();
    if (!plugin) {
      set.status = 503;
      return { detail: MENSAGEM_SEM_PLUGIN };
    }
    const parametros = pickParametros(definicao, (query ?? {}) as Record<string, unknown>);
    // Fora dos meses recentes não se busca nada: a regra vale também para quem chamar a rota direto.
    if (nivel !== "meses" && !isMesPermitido(String(parametros.mes ?? ""), new Date()))
      throw createFieldError("mes", MENSAGEM_MES_ANTIGO);
    const corpo = await responder(
      await readBusca({ plugin, user, workspaceId: ws.id }, definicao.caminho, parametros),
      set
    );
    if (set.status !== 200) return corpo;
    if (nivel === "meses") return filterMesesRecentes(corpo, new Date());
    if (nivel !== "entidades") return corpo;
    return addNomesDasEntidades(corpo, await findNomesPorCodigoDoSac(ws.id));
  });

const downloadModule = new Elysia({ prefix: "/workspaces/:slug/projects/:project_id/bancos" })
  .use(authPlugin)
  .post("/:envio/preparar/", async ({ params: { slug, project_id, envio }, user, set }) => {
    const numero = readEnvio(envio);
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    if (!(await isEnvioAnexadoNoSistema(project_id, numero))) {
      set.status = 404;
      return { detail: MENSAGEM_NAO_ANEXADO };
    }
    const plugin = await findPluginDeBackups();
    if (!plugin) {
      set.status = 503;
      return { detail: MENSAGEM_SEM_PLUGIN };
    }
    return responder(await sendPreparacao({ plugin, user, workspaceId: ws.id }, numero), set);
  })
  .get("/preparar/:preparacao_id/", async ({ params: { slug, project_id, preparacao_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await getProjectOrFail(ws.id, project_id, user.id);
    const plugin = await findPluginDeBackups();
    if (!plugin) {
      set.status = 503;
      return { detail: MENSAGEM_SEM_PLUGIN };
    }
    return responder(await readPreparacao({ plugin, user, workspaceId: ws.id }, preparacao_id), set);
  });

export const bancoAnexoModule = new Elysia().use(buscaModule).use(downloadModule);
