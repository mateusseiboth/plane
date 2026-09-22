/**
 * Registro de ligações do FreePBX dentro do atendimento.
 *
 * A ligação é uma `ChatSession` com `channel = "phone"` mais a linha de
 * `chat_ligacoes`. O PBX a registra por token de serviço; o atendente assume,
 * conclui (sistema, descrição e, se não foi detectado, quem ligou) e pode
 * vincular o chamado aberto a partir dela. Ver .claude/ligacoes-freepbx.md.
 */

import { CHAT_AUDIT_ACTIONS, recordChatAudit } from "@/audit";
import { PHONE_CHANNEL } from "@/canais";
import { saveContatoDoAtendimento } from "@/encerramento";
import * as dao from "@/ligacoes/ligacoes.dao";
import {
  AtendimentoNaoEncontradoError,
  CamposInvalidosError,
  ChamadoNaoEncontradoError,
  LigacaoDeOutraPessoaError,
  LigacaoEncerradaError,
  LigacaoJaConcluidaError,
  LigacaoNaoEncontradaError,
  TokenDeServicoInvalidoError,
  requireValid,
} from "@/ligacoes/errors";
import {
  parseChamado,
  parseConclusao,
  parseLigacaoRecebida,
  type LigacaoRecebida,
  type LigacaoStatus,
} from "@/ligacoes/payload";
import { serializeLigacao, serializeSessaoComLigacao } from "@/ligacoes/serializacao";
import { buildRelatorioDeLigacoes } from "@/ligacoes/relatorio";
import { resolveSituacaoInicial } from "@/ligacoes/situacao-inicial";
import { isSameToken, readServiceToken } from "@/ligacoes/token-de-servico";
import { persistAndBroadcast } from "@/messages";
import { CHAT_ACTION, hasChatAction } from "@/permissoes";
import { nextProtocol } from "@/protocol";
import { assignSessionToAttendant } from "@/queue/router";
import {
  findResponsavelPorId,
  findResponsavelPorTelefone,
  telefoneWithDdi,
  variantesDeTelefone,
} from "@/responsaveis";
import { attendantName } from "@/users";
import { sendToSession, sendToUser, sendToWorkspace } from "@/ws/hub";

export type Atendente = { id: string };

// ── Entrada do PBX ────────────────────────────────────────────────────────────

async function requireServiceToken(slug: string, headers: Record<string, string | undefined>) {
  const token = readServiceToken(headers);
  const config = await dao.findTelefoniaConfig(slug);
  if (token && isSameToken(token, config?.tokenHash)) return;
  throw new TokenDeServicoInvalidoError();
}

/** Ramal mapeado para alguém que (ainda) atende no chat; senão, ninguém. */
async function findAtendenteDoRamal(slug: string, extension: string | null): Promise<string | null> {
  if (!extension) return null;
  const ramal = await dao.findRamal(slug, extension);
  if (!ramal) return null;
  return (await hasChatAction(slug, ramal.userId, CHAT_ACTION.ATENDER)) ? ramal.userId : null;
}

const EVENTO_POR_STATUS: Record<LigacaoStatus, (l: LigacaoRecebida) => string> = {
  answered: (l) =>
    `Ligação recebida${l.caller ? ` de ${l.caller}` : ""}${l.extension ? ` no ramal ${l.extension}` : ""}.`,
  missed: (l) => `Ligação não atendida${l.caller ? ` de ${l.caller}` : ""}.`,
};

async function readRegistrada(slug: string, sessionId: string) {
  const sessao = await dao.findSessaoComLigacao(slug, sessionId);
  if (!sessao?.ligacao) throw new LigacaoNaoEncontradaError();
  return sessao;
}

/** Reenvio do mesmo call_id: o PBX completa fim, duração e gravação. */
async function updateFromPbx(slug: string, ligacaoId: string, sessionId: string, l: LigacaoRecebida) {
  await dao.updateLigacao(ligacaoId, {
    ...(l.endedAt ? { endedAt: l.endedAt } : {}),
    ...(l.durationSec !== null ? { durationSec: l.durationSec } : {}),
    ...(l.recordingUrl ? { recordingUrl: l.recordingUrl } : {}),
  });
  sendToWorkspace(slug, { type: "session.activity", session_id: sessionId });
  return serializeSessaoComLigacao(await readRegistrada(slug, sessionId));
}

async function createFromPbx(slug: string, l: LigacaoRecebida) {
  const [responsavel, atendenteId, protocol] = await Promise.all([
    findResponsavelPorTelefone(slug, l.caller),
    findAtendenteDoRamal(slug, l.extension),
    nextProtocol(slug),
  ]);
  const situacao = resolveSituacaoInicial(l.status, atendenteId, l.endedAt ?? new Date());
  const sessionId = await dao.createSessaoComLigacao(
    {
      workspaceId: slug,
      channel: PHONE_CHANNEL,
      protocol,
      clientPhone: telefoneWithDdi(l.caller) || null,
      clientName: responsavel?.name ?? null,
      entityContactId: responsavel?.id ?? null,
      botState: "done",
      ...situacao,
      ...(l.startedAt ? { createdAt: l.startedAt } : {}),
    },
    {
      workspaceId: slug,
      callId: l.callId,
      caller: l.caller,
      extension: l.extension,
      status: l.status,
      startedAt: l.startedAt,
      endedAt: l.endedAt,
      durationSec: l.durationSec,
      recordingUrl: l.recordingUrl,
    }
  );

  await persistAndBroadcast({ sessionId, sender: "system", type: "event", text: EVENTO_POR_STATUS[l.status](l) });
  notifyAtendente(slug, sessionId, situacao.assignedAttendantId, protocol);
  return serializeSessaoComLigacao(await readRegistrada(slug, sessionId));
}

function notifyAtendente(slug: string, sessionId: string, atendenteId: string | null, protocol: string) {
  if (!atendenteId) return;
  sendToUser(atendenteId, { type: "session.assigned", session_id: sessionId });
  // LGPD: a partir daqui este atendente tem acesso ao registro da ligação.
  recordChatAudit({
    workspaceSlug: slug,
    sessionId,
    action: CHAT_AUDIT_ACTIONS.ASSIGN,
    userId: atendenteId,
    metadata: { protocolo: protocol, canal: PHONE_CHANNEL },
  });
}

const isUniqueViolation = (e: unknown): boolean => (e as { code?: string })?.code === "P2002";

/**
 * Idempotente pelo `call_id`: o primeiro envio cria (201); os seguintes
 * completam o registro (200). Dois envios simultâneos do mesmo call_id caem no
 * índice único e o perdedor vira atualização.
 */
export async function registerLigacao(slug: string, headers: Record<string, string | undefined>, body: unknown) {
  await requireServiceToken(slug, headers);
  const ligacao = requireValid(parseLigacaoRecebida(body));

  const existente = await dao.findLigacaoByCallId(slug, ligacao.callId);
  if (existente) return { status: 200, body: await updateFromPbx(slug, existente.id, existente.sessionId, ligacao) };

  try {
    return { status: 201, body: await createFromPbx(slug, ligacao) };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const vencedora = await dao.findLigacaoByCallId(slug, ligacao.callId);
    if (!vencedora) throw e;
    return { status: 200, body: await updateFromPbx(slug, vencedora.id, vencedora.sessionId, ligacao) };
  }
}

// ── Atendente ─────────────────────────────────────────────────────────────────

/**
 * Mesma regra da lista de atendimentos: o administrador vê tudo; o atendente,
 * o que é dele. Ligação sem ninguém fica aberta a quem atende, para assumir.
 */
async function requireLigacaoAcessivel(slug: string, sessionId: string, atendente: Atendente) {
  const sessao = await readRegistrada(slug, sessionId);
  const livreOuMinha = !sessao.assignedAttendantId || sessao.assignedAttendantId === atendente.id;
  if (livreOuMinha || (await hasChatAction(slug, atendente.id, CHAT_ACTION.ADMINISTRAR))) return sessao;
  throw new LigacaoNaoEncontradaError();
}

export async function readLigacaoDetalhe(slug: string, sessionId: string, atendente: Atendente) {
  const sessao = await requireLigacaoAcessivel(slug, sessionId, atendente);
  const responsavel = sessao.entityContactId ? await findResponsavelPorId(slug, sessao.entityContactId) : null;
  return {
    ...serializeSessaoComLigacao(sessao),
    responsavel: responsavel && {
      id: responsavel.id,
      name: responsavel.name,
      email: responsavel.email,
      phone: responsavel.phone,
      entity_id: responsavel.entityId,
      entity_name: responsavel.entityName,
    },
  };
}

export async function assumeLigacao(slug: string, sessionId: string, atendente: Atendente) {
  const sessao = await readRegistrada(slug, sessionId);
  if (sessao.status === "closed") throw new LigacaoEncerradaError();
  if (sessao.assignedAttendantId && sessao.assignedAttendantId !== atendente.id) throw new LigacaoDeOutraPessoaError();
  await assignSessionToAttendant(sessionId, atendente.id);
  return readLigacaoDetalhe(slug, sessionId, atendente);
}

async function requireProjeto(slug: string, projectId: string) {
  const projeto = await dao.findProjetoDoEspaco(slug, projectId);
  if (projeto) return projeto;
  throw new CamposInvalidosError([{ path: "project_id", message: "Sistema não encontrado." }]);
}

/**
 * Conclui a ligação: classifica o sistema, grava o que o cliente pediu, cadastra
 * quem ligou quando o telefone não identificou, e encerra. Ligação sem atendente
 * passa a ser de quem concluiu (é quem responde por ela no relatório).
 */
export async function concludeLigacao(slug: string, sessionId: string, atendente: Atendente, body: unknown) {
  const sessao = await requireLigacaoAcessivel(slug, sessionId, atendente);
  if (sessao.ligacao?.concludedAt) throw new LigacaoJaConcluidaError();
  const conclusao = requireValid(parseConclusao(body, { hasContato: Boolean(sessao.entityContactId) }));
  const projeto = await requireProjeto(slug, conclusao.projectId);

  const agora = new Date();
  await dao.updateSessao(sessionId, {
    projectId: projeto.id,
    projectIdentifier: projeto.identifier,
    projectName: projeto.name,
  });
  if (conclusao.contact) await saveContatoDoAtendimento(sessionId, conclusao.contact, atendente.id);
  await dao.updateLigacao(sessao.ligacao!.id, {
    descricao: conclusao.descricao,
    concludedById: atendente.id,
    concludedAt: agora,
  });
  await dao.updateSessao(sessionId, {
    status: "closed",
    closedAt: sessao.closedAt ?? agora,
    closedById: atendente.id,
    assignedAttendantId: sessao.assignedAttendantId ?? atendente.id,
  });

  await persistAndBroadcast({
    sessionId,
    sender: "system",
    type: "event",
    text: `Ligação concluída por ${await attendantName(atendente.id)}.`,
  });
  sendToSession(sessionId, { type: "session.closed", session_id: sessionId, protocol: sessao.protocol });
  recordChatAudit({
    workspaceSlug: slug,
    sessionId,
    action: CHAT_AUDIT_ACTIONS.CLOSE,
    userId: atendente.id,
    metadata: { protocolo: sessao.protocol, canal: PHONE_CHANNEL },
  });
  return readLigacaoDetalhe(slug, sessionId, atendente);
}

/** O front cria o chamado pela rota do api-ts e informa aqui qual foi. */
export async function linkChamado(slug: string, sessionId: string, atendente: Atendente, body: unknown) {
  const sessao = await requireLigacaoAcessivel(slug, sessionId, atendente);
  const pedido = requireValid(parseChamado(body));
  const chamado = await dao.findChamadoDoEspaco(slug, pedido.issueId);
  if (!chamado) throw new ChamadoNaoEncontradoError();

  await dao.updateLigacao(sessao.ligacao!.id, {
    ticketKind: pedido.kind,
    ticketId: chamado.id,
    ticketProjectId: chamado.projectId,
    ticketLabel: chamado.label,
  });
  await persistAndBroadcast({
    sessionId,
    sender: "system",
    type: "event",
    text: `Chamado ${chamado.label} vinculado à ligação.`,
  });
  return readLigacaoDetalhe(slug, sessionId, atendente);
}

// ── Histórico do cliente ──────────────────────────────────────────────────────

/**
 * Conversas e ligações da mesma pessoa, da mais nova para a mais antiga. Só o
 * resumo (canal, sistema, quem atendeu, descrição da ligação): o conteúdo das
 * conversas continua na transcrição de cada uma.
 */
export async function readHistoricoDoCliente(slug: string, sessionId: string) {
  const sessao = await dao.findSessaoComLigacao(slug, sessionId);
  if (!sessao) throw new AtendimentoNaoEncontradoError();
  const sessoes = await dao.findHistoricoDoCliente(slug, {
    entityContactId: sessao.entityContactId,
    phones: variantesDeTelefone(sessao.clientPhone),
  });
  const results = await Promise.all(
    sessoes.map(async (s) => ({
      ...serializeSessaoComLigacao(s).session,
      attendant_name: s.assignedAttendantId ? await attendantName(s.assignedAttendantId) : null,
      ligacao: s.ligacao ? serializeLigacao(s.ligacao) : null,
    }))
  );
  return { results };
}

// ── Relatório ─────────────────────────────────────────────────────────────────

export async function readRelatorioDeLigacoes(slug: string, days: number) {
  const sessoes = await dao.findLigacoesDoPeriodo(slug, new Date(Date.now() - days * 86_400_000));
  const contatos = [...new Set(sessoes.map((s) => s.entityContactId).filter((id): id is string => Boolean(id)))];
  const entidades = new Map((await dao.findEntidadesDosResponsaveis(contatos)).map((e) => [e.contactId, e]));

  const relatorio = buildRelatorioDeLigacoes(
    sessoes.map((s) => {
      const entidade = s.entityContactId ? entidades.get(s.entityContactId) : undefined;
      return {
        status: (s.ligacao?.status ?? "answered") as LigacaoStatus,
        concluded: Boolean(s.ligacao?.concludedAt),
        attendantId: s.assignedAttendantId,
        entityId: entidade?.entityId ?? null,
        entityName: entidade?.entityName ?? null,
        projectId: s.projectId,
        projectName: s.projectName,
      };
    })
  );
  const by_attendant = await Promise.all(
    relatorio.by_attendant.map(async (a) => ({ ...a, name: a.id ? await attendantName(a.id) : "Sem atendente" }))
  );
  return { days, ...relatorio, by_attendant };
}
