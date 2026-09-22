/**
 * Conversa de WhatsApp iniciada pelo atendente a partir do Responsável
 * (`entity_contacts`), o cadastro oficial do cliente. Nasce já com a entidade,
 * o responsável e o sistema (o informado ou, quando o responsável cuida de um
 * só, esse). O `POST /sessions/whatsapp/` antigo parte do histórico do chat
 * (`chat_contacts`) e continua existindo para o número digitado à mão.
 */

import prisma from "@db";
import { CamposInvalidosError, ConversaJaAbertaError, requireValid } from "@/atendente/errors";
import { findSistemasDoResponsavel } from "@/atendente/plane.dao";
import { findProjetoDoEspaco, type ProjetoDoEspaco } from "@/ligacoes/ligacoes.dao";
import { asCorpo, erro, isBlank, isUuid, readText, type CampoComErro, type Resultado } from "@/ligacoes/payload";
import { deliverOutbound } from "@/outbound";
import { nextProtocol } from "@/protocol";
import { findResponsavelPorId, telefoneWithDdi, variantesDeTelefone, type Responsavel } from "@/responsaveis";
import { serializeSession, withoutAvaliacao } from "@/sessoes";
import { sendToWorkspace } from "@/ws/hub";

type Pedido = { entityContactId: string; projectId: string | null; message: string | null };

const LIMITE_DA_MENSAGEM = 4000;

function parsePedido(body: unknown): Resultado<Pedido> {
  const corpo = asCorpo(body);
  const errors: CampoComErro[] = [];
  if (!isUuid(corpo.entity_contact_id)) errors.push(erro("entity_contact_id", "Escolha o responsável."));
  if (!isBlank(corpo.project_id) && !isUuid(corpo.project_id)) errors.push(erro("project_id", "Sistema inválido."));
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    data: {
      entityContactId: corpo.entity_contact_id as string,
      projectId: isBlank(corpo.project_id) ? null : String(corpo.project_id),
      message: readText(corpo.message, LIMITE_DA_MENSAGEM),
    },
  };
}

type Contexto = { responsavel: Responsavel; telefone: string; projeto: ProjetoDoEspaco | null };

/** Sem sistema escolhido, vale o único sistema do responsável; mais de um, nenhum. */
async function readProjeto(slug: string, pedido: Pedido): Promise<ProjetoDoEspaco | null> {
  if (pedido.projectId) return findProjetoDoEspaco(slug, pedido.projectId);
  const sistemas = await findSistemasDoResponsavel(pedido.entityContactId);
  return sistemas.length === 1 ? findProjetoDoEspaco(slug, sistemas[0]!) : null;
}

async function readContexto(slug: string, pedido: Pedido): Promise<Contexto> {
  const [responsavel, projeto] = await Promise.all([
    findResponsavelPorId(slug, pedido.entityContactId),
    readProjeto(slug, pedido),
  ]);
  const telefone = telefoneWithDdi(responsavel?.phoneDigits ?? responsavel?.phone);
  const errors: CampoComErro[] = [
    !responsavel ? erro("entity_contact_id", "Responsável não encontrado neste espaço.") : null,
    responsavel && !telefone ? erro("entity_contact_id", "Este responsável não tem telefone.") : null,
    pedido.projectId && !projeto ? erro("project_id", "Sistema não encontrado neste espaço.") : null,
  ].filter((e): e is CampoComErro => e !== null);
  if (errors.length) throw new CamposInvalidosError(errors);
  return { responsavel: responsavel!, telefone, projeto };
}

/** Uma conversa aberta por número: a segunda cairia no mesmo WhatsApp do cliente. */
async function requireSemConversaAberta(slug: string, telefone: string) {
  const aberta = await prisma.chatSession.findFirst({
    where: {
      workspaceId: slug,
      channel: "whatsapp",
      clientPhone: { in: variantesDeTelefone(telefone) },
      status: { not: "closed" },
    },
    select: { id: true },
  });
  if (aberta) throw new ConversaJaAbertaError(aberta.id);
}

export async function startWhatsappDoResponsavel(slug: string, userId: string, body: unknown) {
  const pedido = requireValid(parsePedido(body));
  const { responsavel, telefone, projeto } = await readContexto(slug, pedido);
  await requireSemConversaAberta(slug, telefone);
  const contato = await prisma.contact.upsert({
    where: { workspaceId_phone: { workspaceId: slug, phone: telefone } },
    create: {
      workspaceId: slug,
      phone: telefone,
      name: responsavel.name,
      email: responsavel.email,
      entityId: responsavel.entityId,
    },
    update: {},
  });
  const sessao = await prisma.chatSession.create({
    data: {
      workspaceId: slug,
      channel: "whatsapp",
      contactId: contato.id,
      clientName: responsavel.name,
      clientPhone: telefone,
      protocol: await nextProtocol(),
      status: "active",
      assignedAttendantId: userId,
      botState: "done",
      entityContactId: responsavel.id,
      entityId: responsavel.entityId,
      projectId: projeto?.id ?? null,
      projectIdentifier: projeto?.identifier ?? null,
      projectName: projeto?.name ?? null,
    },
  });
  if (pedido.message)
    await deliverOutbound(sessao, { sender: "attendant", type: "text", text: pedido.message, senderUserId: userId });
  sendToWorkspace(slug, { type: "session.activity", session_id: sessao.id });
  return withoutAvaliacao(serializeSession(sessao));
}
