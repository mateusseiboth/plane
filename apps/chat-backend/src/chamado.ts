/**
 * Vínculo entre a conversa e o chamado aberto a partir dela.
 *
 * O chamado nasce no api-ts (`POST .../inbox-issues/from-chat/`), que grava
 * `external_source = "chat"` e `external_id = <id da sessão>` no próprio
 * chamado. Aqui a sessão só guarda o atalho (id, sistema e código SIA-42) para
 * a lista, a conversa e a impressão, e só aceita chamado que aponte para ela:
 * sem essa conferência qualquer atendente penduraria qualquer chamado em
 * qualquer conversa.
 */

import prisma from "@db";
import { persistAndBroadcast } from "@/messages";
import { sendToWorkspace } from "@/ws/hub";

type Chamado = { id: string; projectId: string; label: string };

async function findChamadoDaSessao(sessionId: string, issueId: string): Promise<Chamado | null> {
  const linhas = (await prisma.$queryRaw`
    SELECT i.id::text AS id, i.project_id::text AS "projectId", p.identifier || '-' || i.sequence_id AS label
      FROM issues i JOIN projects p ON p.id = i.project_id
     WHERE i.id::text = ${issueId} AND i.deleted_at IS NULL
       AND i.external_source = 'chat' AND i.external_id = ${sessionId}
     LIMIT 1`) as Chamado[];
  return linhas[0] ?? null;
}

export async function linkChamado(sessionId: string, issueId: string) {
  const chamado = await findChamadoDaSessao(sessionId, issueId);
  if (!chamado) return null;
  const sessao = await prisma.chatSession.update({
    where: { id: sessionId },
    data: { issueId: chamado.id, issueProjectId: chamado.projectId, issueLabel: chamado.label },
  });
  await persistAndBroadcast({
    sessionId,
    sender: "system",
    type: "event",
    text: `Chamado ${chamado.label} aberto a partir desta conversa.`,
  });
  sendToWorkspace(sessao.workspaceId, { type: "session.activity", session_id: sessionId });
  return sessao;
}
