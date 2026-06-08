// Bot / flow engine. Runs ONLY while there is no active attendant on the session
// (status !== "active"). Once an attendant assigns, the bot stops interfering.
//
// botState machine: new → (awaiting_name | confirm_contact) → menu → in_flow → done

import prisma from "@db";
import { deliverOutbound } from "@/outbound";
import { availableAttendants, isWithinBusinessHours } from "@/presence";
import { routeQueuedSession, assignSessionToAttendant } from "@/queue/router";
import { requestRating } from "@/rating";
import { sendToSession, sendToWorkspace } from "@/ws/hub";

type FlowStep =
  | { type: "message"; text: string }
  | { type: "ask"; text: string; saveAs: string }
  | { type: "queue"; queueId: string }
  | { type: "close"; text?: string };

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

  const contact = await findContact(session);
  if (contact?.name) {
    await sendBot(session, render(cfg.confirmContactMessage, { name: contact.name }));
    await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "confirm_contact", contactId: contact.id, clientName: contact.name } });
  } else {
    await sendBot(session, cfg.askNameMessage);
    await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "awaiting_name" } });
  }
}

/**
 * Native widget start. The name + "system" (project) + optional attendant are
 * collected by the pre-chat form (no bot name/menu questions). We greet, then
 * either route directly to the chosen attendant (if available right now) or fall
 * back to the weighted queue. botState stays "done" so the bot never interferes.
 */
export async function startNativeSession(sessionId: string, opts: { attendantId?: string | null } = {}) {
  const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === "active" || session.status === "closed") return;
  const cfg = await getConfig(session.workspaceId);
  await sendBot(session, cfg.welcomeMessage);

  // Direct route to the attendant the client asked for, if they're available now.
  if (opts.attendantId) {
    const [available] = await availableAttendants(session.workspaceId, [opts.attendantId]);
    if (available) {
      await assignSessionToAttendant(session.id, available);
      return;
    }
  }

  // Otherwise enqueue (no specific queue) + weighted routing.
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

async function runFlowFrom(session: any, flow: any, startIndex: number) {
  const steps = (flow.steps as FlowStep[]) ?? [];
  let i = startIndex;
  const state = (session.flowState as Record<string, unknown>) ?? {};
  while (i < steps.length) {
    const step = steps[i];
    if (step.type === "message") {
      await sendBot(session, render(step.text, state as Record<string, string>));
      i++;
    } else if (step.type === "ask") {
      await sendBot(session, render(step.text, state as Record<string, string>));
      await prisma.chatSession.update({
        where: { id: session.id },
        data: { botState: "in_flow", currentFlowId: flow.id, flowState: { ...state, __step: i, __saveAs: step.saveAs } },
      });
      return; // wait for the client's answer
    } else if (step.type === "queue") {
      await enqueue(session, step.queueId);
      return;
    } else if (step.type === "close") {
      if (step.text) await sendBot(session, render(step.text, state as Record<string, string>));
      await closeByBot(session);
      return;
    } else {
      i++;
    }
  }
  // Flow ended without an explicit close.
  await prisma.chatSession.update({ where: { id: session.id }, data: { botState: "done" } });
}

async function closeByBot(session: any) {
  const cfg = await getConfig(session.workspaceId);
  await prisma.chatSession.update({ where: { id: session.id }, data: { status: "closed", botState: "done", closedAt: new Date() } });
  sendToSession(session.id, { type: "session.closed", session_id: session.id, protocol: session.protocol });
  await deliverOutbound(session, { sender: "system", type: "event", text: render(cfg.closedMessage, { protocol: session.protocol }) });
  await requestRating(session).catch((e) => console.error("[requestRating]", e));
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
      await prisma.chatSession.update({ where: { id: session.id }, data: { contactId: contact.id, clientName: name } });
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
      const flow = session.currentFlowId ? await prisma.botFlow.findUnique({ where: { id: session.currentFlowId } }) : null;
      if (!flow) {
        await presentMenu(session);
        return;
      }
      const state = (session.flowState as Record<string, unknown>) ?? {};
      const saveAs = state.__saveAs as string | undefined;
      const stepIdx = (state.__step as number) ?? 0;
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
