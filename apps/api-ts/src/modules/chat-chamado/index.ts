/**
 * `POST /workspaces/:slug/projects/:project_id/inbox-issues/from-chat/`
 *
 * Abre o chamado a partir de uma conversa do chat: a solicitação nasce na
 * triagem como qualquer outra (`createSolicitacao`), com a transcrição na
 * descrição, os arquivos da conversa anexados, a prioridade (urgente é o
 * "cliente parado" do SAC), o módulo e a entidade da conversa.
 *
 * O chamado aponta para a conversa (`external_source = "chat"`, `external_id =
 * <sessão>`); a conversa guarda o atalho para o chamado quando o atendente
 * confirma no chat-backend (`POST /workspaces/:slug/sessions/:id/chamado/`),
 * que só aceita chamado que aponte para ela. Uma conversa, um chamado.
 *
 * As tabelas do chat (`chat_sessions`, `chat_messages`) são lidas por SQL: são
 * do chat-backend, e este schema não as declara.
 */

import { Elysia } from "elysia";
import prisma from "@db";
import { authPlugin } from "@middleware/auth";
import { createSolicitacao } from "@utils/intake";
import { EProjectAction, requireProjectAction } from "@utils/permission-checks";
import { getWorkspaceOrFail } from "@utils/workspace";
import { copyAnexosDaConversa } from "@modules/chat-chamado/anexos";
import {
  buildTranscricaoHtml,
  escapeHtml,
  type MensagemDoChat,
  type SessaoDoChat,
} from "@modules/chat-chamado/transcricao";

const PRIORIDADES = new Set(["urgent", "high", "medium", "low", "none"]);
const ORIGEM = "chat";
const LIMITE_DO_TITULO = 250;

type Corpo = {
  session_id?: unknown;
  name?: unknown;
  priority?: unknown;
  module_id?: unknown;
  description_html?: unknown;
  chat_url?: unknown;
};

type Sessao = SessaoDoChat & { id: string; entity_id: string | null };

async function readConversa(slug: string, sessionId: string): Promise<Sessao | null> {
  const linhas = (await prisma.$queryRaw`
    SELECT id::text AS id, protocol, client_name, client_phone, channel, created_at, entity_id::text AS entity_id
      FROM chat_sessions WHERE id::text = ${sessionId} AND workspace_id = ${slug} LIMIT 1`) as Sessao[];
  return linhas[0] ?? null;
}

const readMensagens = (sessionId: string) =>
  prisma.$queryRaw`
    SELECT sender, sender_name, type, text, media_key, media_mime, media_name, deleted_at, created_at
      FROM chat_messages WHERE session_id::text = ${sessionId} ORDER BY created_at ASC` as Promise<
    Array<MensagemDoChat & { media_mime: string | null }>
  >;

const findChamadoDaConversa = (sessionId: string) =>
  prisma.issue.findFirst({
    where: { externalSource: ORIGEM, externalId: sessionId, deletedAt: null },
    select: { id: true },
  });

const isModuloDoSistema = async (moduleId: string, projectId: string) =>
  Boolean(await prisma.module.findFirst({ where: { id: moduleId, projectId, deletedAt: null }, select: { id: true } }));

const readTexto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

function buildTitulo(corpo: Corpo, sessao: Sessao): string {
  const informado = readTexto(corpo.name);
  const quem = sessao.client_name || sessao.client_phone || "Cliente";
  return (informado || `Chat ${sessao.protocol}: ${quem}`).slice(0, LIMITE_DO_TITULO);
}

/** Recusa de negócio, com a mensagem que o atendente lê. */
function refuse(
  set: { status?: number | string },
  status: number,
  detail: string,
  extra: Record<string, unknown> = {}
) {
  set.status = status;
  return { detail, ...extra };
}

export const chatChamadoModule = new Elysia({ prefix: "/workspaces/:slug/projects" })
  .use(authPlugin)
  .post("/:project_id/inbox-issues/from-chat/", async ({ params: { slug, project_id }, body, user, set, headers }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireProjectAction(ws.id, project_id, user.id, EProjectAction.INTAKE_CREATE);
    const corpo = (body ?? {}) as Corpo;
    const sessionId = readTexto(corpo.session_id);
    const prioridade = readTexto(corpo.priority) || "none";
    const moduleId = readTexto(corpo.module_id);

    const sessao = sessionId ? await readConversa(slug, sessionId) : null;
    if (!sessao) return refuse(set, 404, "Conversa não encontrada.");
    const existente = await findChamadoDaConversa(sessao.id);
    if (existente) return refuse(set, 409, "Esta conversa já tem chamado.", { issue_id: existente.id });
    if (!PRIORIDADES.has(prioridade)) return refuse(set, 422, "Prioridade inválida.");
    if (moduleId && !(await isModuloDoSistema(moduleId, project_id)))
      return refuse(set, 422, "O módulo não pertence ao sistema escolhido.");

    const mensagens = await readMensagens(sessao.id);
    const complemento = readTexto(corpo.description_html);
    const descricao =
      (complemento ? `<p>${escapeHtml(complemento)}</p>` : "") +
      buildTranscricaoHtml(sessao, mensagens, readTexto(corpo.chat_url) || null);

    const issue = await createSolicitacao({
      workspaceId: ws.id,
      projectId: project_id,
      user,
      name: buildTitulo(corpo, sessao),
      priority: prioridade,
      descriptionHtml: descricao,
      entityId: sessao.entity_id,
      externalSource: ORIGEM,
      externalId: sessao.id,
      headers,
      auditMetadata: { origem: ORIGEM, protocolo: sessao.protocol },
    });
    if (moduleId)
      await prisma.moduleIssue.create({
        data: { moduleId, issueId: issue.id, projectId: project_id, workspaceId: ws.id },
      });
    const anexos = await copyAnexosDaConversa(
      { issueId: issue.id, projectId: project_id, workspaceId: ws.id },
      mensagens
    );

    const projeto = await prisma.project.findUniqueOrThrow({ where: { id: project_id }, select: { identifier: true } });
    set.status = 201;
    return {
      id: issue.id,
      issue: {
        id: issue.id,
        name: issue.name,
        project_id,
        sequence_id: issue.sequenceId,
        label: `${projeto.identifier}-${issue.sequenceId}`,
      },
      anexos: anexos.copiados,
      anexos_falharam: anexos.falharam,
    };
  });
