// Bot / flow engine. Runs ONLY while there is no active attendant on the session
// (status !== "active"). Once an attendant assigns, the bot stops interfering.
//
// botState machine: new → (awaiting_name | confirm_contact) → menu → in_flow → done

import prisma from "@db";
import { deliverOutbound } from "@/outbound";
import { buscarResponsavelPorTelefone } from "@/responsaveis";
import { isWithinBusinessHours } from "@/presence";
import { routeQueuedSession } from "@/queue/router";
import { sendToWorkspace } from "@/ws/hub";
import { CAUSA_DO_FIM } from "@/ciclo-de-vida/abandono";
import { closeAtendimento } from "@/ciclo-de-vida/encerrar";
import { apiTsClient } from "@/bot/acao/api-ts";
import { findArquivoDoCliente, readArquivoDaMensagem } from "@/bot/acao/arquivo";
import { createDestinos } from "@/bot/acao/destinos";
import { createAcaoRunner } from "@/bot/acao/executar";
import type { AcaoStep } from "@/bot/acao/tipos";

type FlowStep =
  | { type: "message"; text: string }
  | { type: "ask"; text: string; saveAs: string }
  | { type: "queue"; queueId: string }
  | { type: "close"; text?: string }
  | AcaoStep;

async function getConfig(workspaceId: string) {
  return (
    (await prisma.botConfig.findUnique({ where: { workspaceId } })) ??
    (await prisma.botConfig.create({ data: { workspaceId } }))
  );
}

function render(template: string, vars: Record<string, string | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

async function findContact(session: any) {
  if (session.contactId) return prisma.contact.findUnique({ where: { id: session.contactId } });
  if (session.channel === "whatsapp" && session.clientPhone)
    return prisma.contact.findFirst({ where: { workspaceId: session.workspaceId, phone: session.clientPhone } });
  return null;
}

/**
 * Quem está do outro lado do número.
 *
 * O Responsável cadastrado vem na frente do histórico do chat: é o cadastro
 * oficial do cliente, escrito por gente, enquanto o contato do chat guarda o
 * nome de perfil que o WhatsApp mandou ("Zé Celular"). É pelo nome do
 * responsável que o bot pergunta "Você é {name}?".
 */
async function identificarPessoa(session: any) {
  const [responsavel, contato] = await Promise.all([
    buscarResponsavelPorTelefone(session.workspaceId, session.clientPhone),
    findContact(session),
  ]);
  return { responsavel, contato, nome: responsavel?.name ?? contato?.name ?? null };
}

async function sendBot(session: any, text: string) {
  await deliverOutbound(session, { sender: "bot", type: "text", text });
}

async function presentMenu(session: any) {
  const cfg = await getConfig(session.workspaceId);
  const options = await prisma.botMenuOption.findMany({
    where: { workspaceId: session.workspaceId, isActive: true },
    orderBy: { order: "asc" },
  });
  const lines = options.map((o) => `${o.key}) ${o.label}`).join("\n");
  await sendBot(session, `${cfg.menuHeader}\n${lines}`);
  await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "menu" } });
}

/** Called when a session is first created (native) or first inbound (whatsapp). */
export async function startBot(sessionId: string) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "active" || session.status === "closed") return;
  const cfg = await getConfig(session.workspaceId);
  await sendBot(session, cfg.welcomeMessage);

  const { responsavel, contato, nome } = await identificarPessoa(session);
  if (!nome) {
    await sendBot(session, cfg.askNameMessage);
    await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "awaiting_name" } });
    return;
  }

  await sendBot(session, render(cfg.confirmContactMessage, { name: nome }));
  await prisma.chatSession.update({
    where: { id: session.id },
    data: {
      botState: "confirm_contact",
      clientName: nome,
      ...(contato ? { contactId: contato.id } : {}),
      ...(responsavel ? { entityContactId: responsavel.id } : {}),
    },
  });
}

/**
 * Native widget start. The pre-chat form collects the name + "system" (project)
 * — no bot name/menu questions. We greet and hand the conversation to the
 * weighted queue. botState stays "done" so the bot never interferes.
 */
export async function startNativeSession(sessionId: string) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "active" || session.status === "closed") return;
  const cfg = await getConfig(session.workspaceId);
  await sendBot(session, cfg.welcomeMessage);

  // Sempre a fila: o cliente não escolhe atendente. Escolher deixava a conversa
  // parada na caixa de quem estava ocupado (ou fora do horário) com o resto da
  // equipe livre — a distribuição por peso existe justamente para evitar isso.
  await prisma.chatSession.update({ where: { id: session.id }, data: { status: "queued", botState: "done" } });
  sendToWorkspace(session.workspaceId, { type: "session.queued", session_id: session.id });
  const assigned = await routeQueuedSession(session.id);
  if (!assigned) {
    const open = await isWithinBusinessHours(session.workspaceId);
    await sendBot(session, open ? cfg.noAttendantsMessage : cfg.outsideHoursMessage);
  }
}

function isYes(text: string): boolean {
  return /^(s|sim|yes|y|1|isso|correto)\b/i.test(text.trim());
}

async function enqueue(session: any, queueId: string) {
  await prisma.chatSession.update({ where: { id: session.id }, data: { status: "queued", queueId, botState: "done" } });
  sendToWorkspace(session.workspaceId, { type: "session.queued", session_id: session.id, queue_id: queueId });
  const cfg = await getConfig(session.workspaceId);
  const assigned = await routeQueuedSession(session.id);
  if (!assigned) {
    const open = await isWithinBusinessHours(session.workspaceId);
    await sendBot(session, open ? cfg.noAttendantsMessage : cfg.outsideHoursMessage);
  }
}

/** Destinos do passo "ação" (ouvidoria, currículo, e-mail do responsável). */
export const DESTINOS_DO_ROBO = createDestinos({ api: apiTsClient, readArquivo: readArquivoDaMensagem });

const acao = createAcaoRunner({
  destinos: DESTINOS_DO_ROBO,
  send: (session, text) => sendBot(session, text),
  saveEstado: async (session, flowId, estado) => {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { botState: "in_flow", currentFlowId: flowId, flowState: estado as any },
    });
  },
  findArquivo: findArquivoDoCliente,
});

type Estado = Record<string, unknown>;

/** "seguir" passa ao próximo passo; "parar" encerra a rodada (espera resposta, fila ou fim). */
type Seguimento = { next: "seguir" | "parar"; state: Estado };
type StepCtx = { session: any; flow: any; index: number; state: Estado };

const seguir = (state: Estado): Seguimento => ({ next: "seguir", state });
const PARAR: Seguimento = { next: "parar", state: {} };

/** O que cada tipo de passo faz (strategy map). Tipo desconhecido é pulado. */
const STEP_RUNNERS: Record<string, (step: any, ctx: StepCtx) => Promise<Seguimento>> = {
  message: async (step, { session, state }) => {
    await sendBot(session, render(step.text, state as Record<string, string>));
    return seguir(state);
  },
  ask: async (step, { session, flow, index, state }) => {
    await sendBot(session, render(step.text, state as Record<string, string>));
    await prisma.chatSession.update({
      where: { id: session.id },
      data: {
        botState: "in_flow",
        currentFlowId: flow.id,
        flowState: { ...state, __step: index, __saveAs: step.saveAs } as any,
      },
    });
    return PARAR; // wait for the client's answer
  },
  queue: async (step, { session }) => {
    await enqueue(session, step.queueId);
    return PARAR;
  },
  close: async (step, { session, state }) => {
    if (step.text) await sendBot(session, render(step.text, state as Record<string, string>));
    await closeByBot(session);
    return PARAR;
  },
  action: async (step, { session, flow, index, state }) => {
    const r = await acao.start({ session, flow, index, state, step });
    return { next: r.status === "concluida" ? "seguir" : "parar", state: r.state };
  },
};

async function runFlowFrom(session: any, flow: any, startIndex: number) {
  const steps = (flow.steps as FlowStep[]) ?? [];
  let state = (session.flowState as Estado) ?? {};
  for (let i = startIndex; i < steps.length; i++) {
    const runner = STEP_RUNNERS[steps[i]!.type];
    if (!runner) continue;
    // Em série de propósito: cada passo depende do que o anterior mandou e gravou.
    // oxlint-disable-next-line no-await-in-loop
    const r = await runner(steps[i], { session: { ...session, flowState: state }, flow, index: i, state });
    if (r.next === "parar") return;
    state = r.state;
  }
  // Flow ended without an explicit close.
  await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "done", flowState: state as any } });
}

/** Fluxo que termina em "close": mesmo caminho de encerramento de todo o chat. */
async function closeByBot(session: any) {
  await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "done" } });
  await closeAtendimento({ sessionId: session.id, causa: CAUSA_DO_FIM.ROBO });
}

/** Process a client message. No-op if an attendant is already active. */
export async function handleInboundClient(sessionId: string, text: string) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session) return;
  if (session.status === "active") return; // attendant owns the conversation
  if (session.status === "closed") return;

  const cfg = await getConfig(session.workspaceId);
  const body = text.trim();

  switch (session.botState) {
    case "new":
      await startBot(sessionId);
      return;

    case "awaiting_name": {
      const name = body.slice(0, 120);
      let contact = await findContact(session);
      if (contact) contact = await prisma.contact.update({ where: { id: contact.id }, data: { name } });
      else
        contact = await prisma.contact.create({
          data: { workspaceId: session.workspaceId, name, phone: session.clientPhone ?? null },
        });
      // Quem digita o próprio nome aqui ou não tinha cadastro, ou disse que não
      // é o responsável que identificamos: em qualquer dos casos o vínculo com
      // o Responsável deixa de valer, e refazê-lo é papel do encerramento.
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { contactId: contact.id, clientName: name, entityContactId: null },
      });
      await presentMenu({ ...session, contactId: contact.id, clientName: name });
      return;
    }

    case "confirm_contact": {
      if (isYes(body)) {
        await presentMenu(session);
      } else {
        await sendBot(session, cfg.askNameMessage);
        await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "awaiting_name" } });
      }
      return;
    }

    case "menu": {
      const option = await prisma.botMenuOption.findFirst({
        where: { workspaceId: session.workspaceId, isActive: true, key: body },
      });
      if (!option) {
        await sendBot(session, "Opção inválida. " + cfg.menuHeader);
        await presentMenu(session);
        return;
      }
      if (option.action === "queue" && option.queueId) {
        await enqueue(session, option.queueId);
      } else if (option.action === "flow" && option.flowId) {
        const flow = await prisma.botFlow.findUnique({ where: { id: option.flowId } });
        if (flow) await runFlowFrom(session, flow, 0);
      } else if (option.action === "message") {
        if (option.message) await sendBot(session, option.message);
        await presentMenu(session);
      }
      return;
    }

    case "in_flow": {
      const flow = session.currentFlowId
        ? await prisma.botFlow.findUnique({ where: { id: session.currentFlowId } })
        : null;
      if (!flow) {
        await presentMenu(session);
        return;
      }
      const state = (session.flowState as Record<string, unknown>) ?? {};
      const stepIdx = (state.__step as number) ?? 0;
      if (state.__acao) {
        const step = ((flow.steps as FlowStep[]) ?? [])[stepIdx] as AcaoStep;
        const r = await acao.answer({ session, flow, state, step }, body);
        if (r.status === "concluida") await runFlowFrom({ ...session, flowState: r.state }, flow, stepIdx + 1);
        return;
      }
      const saveAs = state.__saveAs as string | undefined;
      const newState = { ...state };
      if (saveAs) newState[saveAs] = body;
      delete newState.__saveAs;
      const updated = { ...session, flowState: newState };
      await runFlowFrom(updated, flow, stepIdx + 1);
      return;
    }

    default:
      await presentMenu(session);
  }
}
