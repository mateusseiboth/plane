/**
 * `POST /workspaces/:slug/projects/:project_id/inbox-issues/from-chat/`
 *
 * Abre o chamado a partir de uma conversa do chat: a solicitação nasce na
 * triagem como qualquer outra (`createSolicitacao`), com a transcrição na
 * descrição, os arquivos da conversa anexados, a prioridade (urgente é o
 * "cliente parado" do SAC), o módulo e a entidade (a escolhida no modal ou, sem
 * escolha, a da conversa). O complemento vem do editor de texto rico e entra
 * antes da transcrição.
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
import { createSolicitacao, findErrosDaSolicitacao, requireSistemaDoEspaco } from "@utils/intake";
import { EProjectAction, requireWorkspaceAction } from "@utils/permission-checks";
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
  /** Ausente: a entidade da conversa. Vazio ou null: sem entidade. */
  entity_id?: unknown;
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

const readTexto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/** A entidade do chamado: a informada no corpo prevalece sobre a da conversa. */
const readEntidade = (corpo: Corpo, sessao: Sessao): string | null =>
  corpo.entity_id === undefined ? sessao.entity_id : readTexto(corpo.entity_id) || null;

const isHtml = (texto: string) => texto.startsWith("<");
const readTextoDoHtml = (html: string) => html.replace(/<[^>]+>/g, "").trim();

/**
 * O complemento como vai na descrição: o HTML do editor como veio; texto puro
 * (cliente antigo) escapado num parágrafo. Editor vazio (`<p></p>`) não entra.
 */
function buildComplemento(valor: unknown): string {
  const texto = readTexto(valor);
  if (!readTextoDoHtml(texto)) return "";
  return isHtml(texto) ? texto : `<p>${escapeHtml(texto)}</p>`;
}

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
    // Uma pergunta só: abrir chamado pela conversa é ação do chat, no espaço.
    // O atendimento abre solicitação para QUALQUER sistema, inclusive os de
    // que não é membro: a triagem é de quem recebe o pedido, não de quem o abre.
    await requireWorkspaceAction(ws.id, user.id, EProjectAction.CHAT_ABRIR_CHAMADO);
    await requireSistemaDoEspaco(project_id, ws.id);
    const corpo = (body ?? {}) as Corpo;
    const sessionId = readTexto(corpo.session_id);
    const prioridade = readTexto(corpo.priority) || "none";
    const moduleId = readTexto(corpo.module_id);

    const sessao = sessionId ? await readConversa(slug, sessionId) : null;
    if (!sessao) return refuse(set, 404, "Conversa não encontrada.");
    const existente = await findChamadoDaConversa(sessao.id);
    if (existente) return refuse(set, 409, "Esta conversa já tem chamado.", { issue_id: existente.id });
    if (!PRIORIDADES.has(prioridade)) return refuse(set, 422, "Prioridade inválida.");
    const entityId = readEntidade(corpo, sessao);
    const erros = await findErrosDaSolicitacao({ projectId: project_id, workspaceId: ws.id, moduleId, entityId });
    if (erros.length) return refuse(set, 422, erros[0]!.message, { errors: erros });

    const mensagens = await readMensagens(sessao.id);
    const descricao =
      buildComplemento(corpo.description_html) +
      buildTranscricaoHtml(sessao, mensagens, readTexto(corpo.chat_url) || null);

    const issue = await createSolicitacao({
      workspaceId: ws.id,
      projectId: project_id,
      user,
      name: buildTitulo(corpo, sessao),
      priority: prioridade,
      descriptionHtml: descricao,
      entityId,
      moduleId: moduleId || null,
      externalSource: ORIGEM,
      externalId: sessao.id,
      headers,
      auditMetadata: { origem: ORIGEM, protocolo: sessao.protocol },
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
