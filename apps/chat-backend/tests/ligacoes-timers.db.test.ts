/**
 * Ligação não é conversa: os timers de inatividade e de SLA e o roteamento da
 * fila não podem pegar a sessão `channel = "phone"`. Roda os timers em processo,
 * contra o banco (DATABASE_URL), num espaço de slug aleatório.
 */
import { afterAll, describe, expect, test } from "bun:test";
import prisma from "@db";
import { routeQueuedSession } from "@/queue/router";
import { runInatividade } from "@/ciclo-de-vida/inatividade";
import { checkSla } from "@/timers";
import { register, unregister } from "@/ws/hub";
import { cleanWorkspace, uniqueWorkspace } from "@tests/helpers/harness";

const workspace = uniqueWorkspace("wsligtimer");
const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);

const createLigacao = (data: Record<string, unknown>) =>
  prisma.chatSession.create({
    data: {
      workspaceId: workspace,
      channel: "phone",
      protocol: `T-${crypto.randomUUID().slice(0, 8)}`,
      botState: "done",
      createdAt: umaHoraAtras,
      ...data,
    },
  });

afterAll(async () => {
  await cleanWorkspace(workspace);
});

describe("ligações fora dos timers do chat", () => {
  test("inatividade não pergunta nem encerra ligação esperando atendente", async () => {
    const s = await createLigacao({ status: "queued" });
    await runInatividade(Date.now(), workspace);
    const depois = await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(depois.idlePromptedAt).toBeNull();
    expect(depois.status).toBe("queued");
    expect(await prisma.chatMessage.count({ where: { sessionId: s.id } })).toBe(0);
  });

  test("SLA alerta a conversa parada, mas não a ligação", async () => {
    const atendenteId = crypto.randomUUID();
    const recebidos: any[] = [];
    register({
      id: `teste-${atendenteId}`,
      kind: "attendant",
      workspaceId: workspace,
      userId: atendenteId,
      send: (d) => recebidos.push(d),
      alive: true,
      lastPongAt: Date.now(),
    });
    const parada = { status: "active", assignedAttendantId: atendenteId, lastClientMessageAt: umaHoraAtras };
    const ligacao = await createLigacao(parada);
    const conversa = await createLigacao({ ...parada, channel: "whatsapp" });

    await checkSla();
    unregister(`teste-${atendenteId}`);

    const alertadas = recebidos.filter((e) => e.type === "alert.sla").map((e) => e.session_id);
    expect(alertadas).toContain(conversa.id);
    expect(alertadas).not.toContain(ligacao.id);
  });

  test("roteamento da fila ignora ligação", async () => {
    const s = await createLigacao({ status: "queued" });
    expect(await routeQueuedSession(s.id)).toBeNull();
  });
});
