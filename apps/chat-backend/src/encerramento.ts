/**
 * O que o atendente informa na hora de encerrar: para qual sistema era o
 * suporte e quem era a pessoa do outro lado.
 *
 * O cadastro nasce aqui porque é o único momento em que o atendente tem a
 * informação fresca — depois ninguém volta para completar. E ele nasce em
 * `entity_contacts` (Responsáveis), não num registro paralelo: é o mesmo
 * cadastro que a visita técnica e a entidade usam.
 *
 * O `Contact` do chat continua existindo e sendo atualizado — é o histórico da
 * conversa por telefone, não o cadastro do cliente.
 */

import prisma from "@db";
import { salvarResponsavel, type Responsavel } from "@/responsaveis";

export type CadastroDoEncerramento = {
  /** Responsável já existente escolhido pelo atendente na busca. */
  contact_id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  entity_id?: string | null;
  type_id?: string | null;
};

export type DadosDoEncerramento = {
  project_id?: string | null;
  contact?: CadastroDoEncerramento | null;
};

async function classificarSistema(sessionId: string, projectId?: string | null) {
  if (!projectId) return;
  await prisma.chatSession.updateMany({ where: { id: sessionId }, data: { projectId } });
}

/** O histórico do chat acompanha o cadastro, para a lista mostrar o nome certo. */
async function atualizarHistoricoDoChat(contactId: string | null, responsavel: Responsavel) {
  if (!contactId) return;
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      name: responsavel.name,
      ...(responsavel.email ? { email: responsavel.email } : {}),
      ...(responsavel.entityId ? { entityId: responsavel.entityId } : {}),
    },
  });
}

/**
 * Grava classificação e cadastro ANTES de fechar: a mensagem de encerramento
 * sai logo em seguida e o dado precisa já existir quando ela sair.
 */
export async function registrarEncerramento(
  sessionId: string,
  dados: DadosDoEncerramento,
  atendenteId?: string | null
): Promise<Responsavel | null> {
  const sessao = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { workspaceId: true, contactId: true, clientPhone: true, entityContactId: true },
  });
  if (!sessao) return null;

  await classificarSistema(sessionId, dados.project_id);

  const cadastro = dados.contact;
  if (!cadastro) return null;

  const responsavel = await salvarResponsavel(
    sessao.workspaceId,
    {
      id: cadastro.contact_id ?? sessao.entityContactId ?? null,
      name: cadastro.name ?? null,
      email: cadastro.email ?? null,
      phone: cadastro.phone ?? sessao.clientPhone ?? null,
      entityId: cadastro.entity_id ?? null,
      typeId: cadastro.type_id ?? null,
    },
    atendenteId
  );
  if (!responsavel) return null;

  await prisma.chatSession.updateMany({
    where: { id: sessionId },
    data: { entityContactId: responsavel.id, clientName: responsavel.name },
  });
  await atualizarHistoricoDoChat(sessao.contactId, responsavel);
  return responsavel;
}
