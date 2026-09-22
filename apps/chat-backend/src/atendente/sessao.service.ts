/**
 * Ações do atendente sobre uma conversa aberta: enviar a chave de acesso
 * remoto, pausar/retomar o alerta de cliente sem resposta e definir entidade,
 * sistema e responsável durante o atendimento. Toda ação confere que a conversa
 * é do espaço da URL (o `workspaceId` do chat é o slug).
 */

import prisma from "@db";
import { parseCadastro, type MudancaDoCadastro } from "@/atendente/cadastro-regras";
import { TIPO_CHAVE, parseChave } from "@/atendente/chave";
import { AtendenteError, AtendimentoNaoEncontradoError, CamposInvalidosError, requireValid } from "@/atendente/errors";
import { findEntidadeDoEspaco, type EntidadeDoEspaco } from "@/atendente/plane.dao";
import { findProjetoDoEspaco, type ProjetoDoEspaco } from "@/ligacoes/ligacoes.dao";
import { asCorpo, erro, type CampoComErro } from "@/ligacoes/payload";
import { serializeMessage } from "@/messages";
import { deliverOutbound } from "@/outbound";
import { findResponsavelPorId, type Responsavel } from "@/responsaveis";
import { serializeSession, withoutAvaliacao } from "@/sessoes";
import { sendToWorkspace } from "@/ws/hub";

type Sessao = NonNullable<Awaited<ReturnType<typeof prisma.chatSession.findFirst>>>;

export async function requireSessao(slug: string, id: string): Promise<Sessao> {
  const sessao = await prisma.chatSession.findFirst({ where: { id, workspaceId: slug } });
  if (!sessao) throw new AtendimentoNaoEncontradoError();
  return sessao;
}

const serializeParaEquipe = (s: Sessao) => withoutAvaliacao(serializeSession(s));

// ── Chave de acesso remoto ────────────────────────────────────────────────────

export async function sendChave(slug: string, id: string, userId: string, body: unknown) {
  const chave = requireValid(parseChave(body));
  const sessao = await requireSessao(slug, id);
  if (sessao.status === "closed") throw new AtendenteError("Esta conversa já foi encerrada.", 409);
  const mensagem = await deliverOutbound(sessao, {
    sender: "attendant",
    type: TIPO_CHAVE,
    text: chave,
    senderUserId: userId,
    withoutSenderName: asCorpo(body).without_sender_name === true,
  });
  return serializeMessage(mensagem, { full: true });
}

// ── Alerta de cliente sem resposta ────────────────────────────────────────────

export async function changeAlerta(slug: string, id: string, pausar: boolean) {
  await requireSessao(slug, id);
  const sessao = await prisma.chatSession.update({
    where: { id },
    data: { slaAlertPausedAt: pausar ? new Date() : null },
  });
  return serializeParaEquipe(sessao);
}

// ── Entidade, sistema e responsável ───────────────────────────────────────────

const serializeResponsavel = (r: Responsavel) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  photo: r.photo,
  entity_id: r.entityId,
  entity_name: r.entityName,
});

export async function readCadastro(slug: string, id: string) {
  const sessao = await requireSessao(slug, id);
  const [entidade, responsavel] = await Promise.all([
    sessao.entityId ? findEntidadeDoEspaco(slug, sessao.entityId) : null,
    sessao.entityContactId ? findResponsavelPorId(slug, sessao.entityContactId) : null,
  ]);
  return {
    session: serializeParaEquipe(sessao),
    entity: entidade,
    project: sessao.projectId
      ? { id: sessao.projectId, identifier: sessao.projectIdentifier, name: sessao.projectName }
      : null,
    responsavel: responsavel ? serializeResponsavel(responsavel) : null,
  };
}

type Encontrados = {
  entidade: EntidadeDoEspaco | null;
  projeto: ProjetoDoEspaco | null;
  responsavel: Responsavel | null;
};

async function findReferencias(slug: string, m: MudancaDoCadastro): Promise<Encontrados> {
  const [entidade, projeto, responsavel] = await Promise.all([
    m.entityId ? findEntidadeDoEspaco(slug, m.entityId) : null,
    m.projectId ? findProjetoDoEspaco(slug, m.projectId) : null,
    m.entityContactId ? findResponsavelPorId(slug, m.entityContactId) : null,
  ]);
  return { entidade, projeto, responsavel };
}

/** Id bem formado que não é deste espaço volta no campo, como o formato inválido. */
function requireEncontrados(m: MudancaDoCadastro, achados: Encontrados) {
  const errors: CampoComErro[] = [
    m.entityId && !achados.entidade ? erro("entity_id", "Entidade não encontrada neste espaço.") : null,
    m.projectId && !achados.projeto ? erro("project_id", "Sistema não encontrado neste espaço.") : null,
    m.entityContactId && !achados.responsavel
      ? erro("entity_contact_id", "Responsável não encontrado neste espaço.")
      : null,
  ].filter((e): e is CampoComErro => e !== null);
  if (errors.length) throw new CamposInvalidosError(errors);
}

const buildProjeto = (p: ProjetoDoEspaco | null) => ({
  projectId: p?.id ?? null,
  projectIdentifier: p?.identifier ?? null,
  projectName: p?.name ?? null,
});

/**
 * O responsável é de uma entidade: escolhê-lo já define a entidade, a menos que
 * o atendente tenha escolhido outra na mesma gravação.
 */
const buildMudanca = (m: MudancaDoCadastro, e: Encontrados) => ({
  ...(e.responsavel?.entityId ? { entityId: e.responsavel.entityId } : {}),
  ...("entityId" in m ? { entityId: m.entityId ?? null } : {}),
  ...("projectId" in m ? buildProjeto(e.projeto) : {}),
  ...("entityContactId" in m ? { entityContactId: m.entityContactId ?? null } : {}),
});

export async function updateCadastro(slug: string, id: string, body: unknown) {
  const mudanca = requireValid(parseCadastro(body));
  await requireSessao(slug, id);
  const encontrados = await findReferencias(slug, mudanca);
  requireEncontrados(mudanca, encontrados);
  await prisma.chatSession.update({ where: { id }, data: buildMudanca(mudanca, encontrados) });
  sendToWorkspace(slug, { type: "session.activity", session_id: id });
  return readCadastro(slug, id);
}
