/**
 * Ciclo de vida do atendimento contra o banco, no próprio processo do teste:
 * encerramento classificado (entidade obrigatória), inatividade em conversa
 * ativa (pergunta 1/99 e abandono tipo 5), fim do dia, pausa vencida, falha de
 * envio com reenvio e vínculo com o chamado.
 *
 * Os relógios são passados como argumento (`agora`), então nada espera 10
 * minutos. A Z-API é o servidor falso do harness; nada sai para o WhatsApp.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { TIPO_ABANDONO } from "@/ciclo-de-vida/abandono";
import { runFimDoDia } from "@/ciclo-de-vida/fim-do-dia";
import { handleRespostaDeInatividade, runInatividade } from "@/ciclo-de-vida/inatividade";
import { pauseAtendimento, resumeAtendimento, runPausasVencidas } from "@/ciclo-de-vida/pausa";
import { EncerramentoError, closeWithEncerramento } from "@/encerramento";
import { linkChamado } from "@/chamado";
import { deliverOutbound, resendMessage } from "@/outbound";
import {
  cleanWorkspace,
  configureWorkspace,
  criarEntidade,
  criarWorkspacePlane,
  limparWorkspacePlane,
  startFakeZapi,
  uniqueWorkspace,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsciclo");
const MIN = 60_000;
let zapi: FakeZapi;
let workspaceUuid: string;
let entidade: string;
let projeto: string;
let modulo: string;

const phone = () => `5567${Math.floor(100000000 + Math.random() * 899999999)}`;

async function createSessao(dados: Record<string, unknown> = {}) {
  return prisma.chatSession.create({
    data: {
      workspaceId: slug,
      protocol: `T-${crypto.randomUUID().slice(0, 12)}`,
      channel: "whatsapp",
      clientPhone: phone(),
      status: "active",
      botState: "done",
      assignedAttendantId: crypto.randomUUID(),
      ...dados,
    },
  });
}

const readSessao = (id: string) => prisma.chatSession.findUniqueOrThrow({ where: { id } });
const textosDoBot = async (id: string) =>
  (await prisma.chatMessage.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" } })).map(
    (m) => m.text ?? ""
  );

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  workspaceUuid = await criarWorkspacePlane(slug);
  entidade = await criarEntidade(workspaceUuid, "Prefeitura de Teste");
  projeto = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO projects (id, updated_at, workspace_id, name, identifier) VALUES ($1::uuid, now(), $2::uuid, 'SIART', 'SIA')`,
    projeto,
    workspaceUuid
  );
  modulo = crypto.randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO modules (id, updated_at, project_id, workspace_id, name) VALUES ($1::uuid, now(), $2::uuid, $3::uuid, 'Tributos')`,
    modulo,
    projeto,
    workspaceUuid
  );
});

afterAll(async () => {
  zapi?.stop();
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
});

describe("encerramento pelo atendente", () => {
  it("sem entidade, recusa e a conversa continua aberta", async () => {
    const s = await createSessao();
    const erro = await closeWithEncerramento(s.id, { motivo: "Dúvida" }, null).catch((e) => e);
    expect(erro).toBeInstanceOf(EncerramentoError);
    expect(erro.status).toBe(422);
    expect((await readSessao(s.id)).status).toBe("active");
  });

  it("grava motivo, funcionalidade, observação e entidade; não é abandono", async () => {
    const s = await createSessao({ lastAttendantMessageAt: new Date() });
    await closeWithEncerramento(
      s.id,
      { entity_id: entidade, motivo: "Dúvida", module_id: modulo, note: "Explicado o cálculo.", project_id: projeto },
      null
    );
    const fechada = await readSessao(s.id);
    expect(fechada).toMatchObject({
      status: "closed",
      entityId: entidade,
      closeReason: "Dúvida",
      closeModuleId: modulo,
      closeModuleName: "Tributos",
      closeNote: "Explicado o cálculo.",
      endKind: "atendente",
      abandonType: null,
      projectId: projeto,
    });
  });

  it("funcionalidade de outro sistema é recusada", async () => {
    const s = await createSessao({ projectId: crypto.randomUUID() });
    const erro = await closeWithEncerramento(s.id, { entity_id: entidade, module_id: modulo }, null).catch((e) => e);
    expect(erro).toBeInstanceOf(EncerramentoError);
    expect((await readSessao(s.id)).status).toBe("active");
  });
});

describe("inatividade na conversa ativa", () => {
  it("pergunta 1/99 depois de 10 minutos sem resposta ao atendente", async () => {
    const agora = Date.now();
    const s = await createSessao({ lastAttendantMessageAt: new Date(agora - 11 * MIN) });
    await runInatividade(agora, slug);
    const depois = await readSessao(s.id);
    expect(depois.idlePromptedAt).not.toBeNull();
    expect((await textosDoBot(s.id)).some((t) => t.includes("99"))).toBe(true);
    await zapi.waitFor((c) => c.action === "send-text" && c.body.phone === s.clientPhone);
  });

  it("99 encerra pelo cliente, sem abandono", async () => {
    const s = await createSessao({ lastAttendantMessageAt: new Date(), idlePromptedAt: new Date() });
    expect(await handleRespostaDeInatividade(s.id, "99")).toBe(true);
    expect(await readSessao(s.id)).toMatchObject({ status: "closed", endKind: "cliente", abandonType: null });
  });

  it("1 continua, avisa o atendente e zera a pergunta", async () => {
    const s = await createSessao({ lastAttendantMessageAt: new Date(), idlePromptedAt: new Date() });
    expect(await handleRespostaDeInatividade(s.id, "1")).toBe(true);
    const depois = await readSessao(s.id);
    expect(depois.status).toBe("active");
    expect(depois.idlePromptedAt).toBeNull();
  });

  it("sem pergunta pendente, a mensagem segue normal", async () => {
    const s = await createSessao();
    expect(await handleRespostaDeInatividade(s.id, "99")).toBe(false);
  });

  it("perguntou e ficou mais 10 minutos em silêncio: abandono por inatividade (5)", async () => {
    const agora = Date.now();
    const s = await createSessao({
      lastAttendantMessageAt: new Date(agora - 30 * MIN),
      idlePromptedAt: new Date(agora - 11 * MIN),
    });
    await runInatividade(agora, slug);
    expect(await readSessao(s.id)).toMatchObject({
      status: "closed",
      endKind: "inatividade",
      abandonType: TIPO_ABANDONO.INATIVIDADE,
    });
  });

  it("ligação (W06) e conversa pausada ficam de fora", async () => {
    const agora = Date.now();
    const ligacao = await createSessao({ channel: "phone", lastAttendantMessageAt: new Date(agora - 11 * MIN) });
    const pausada = await createSessao({
      status: "paused",
      pausedAt: new Date(),
      lastAttendantMessageAt: new Date(agora - 11 * MIN),
    });
    await runInatividade(agora, slug);
    expect((await readSessao(ligacao.id)).idlePromptedAt).toBeNull();
    expect((await readSessao(pausada.id)).idlePromptedAt).toBeNull();
  });

  it("robô e fila sem resposta também fecham como abandono na fila (3)", async () => {
    const agora = Date.now();
    const s = await createSessao({
      status: "queued",
      assignedAttendantId: null,
      lastClientMessageAt: new Date(agora - 30 * MIN),
      idlePromptedAt: new Date(agora - 11 * MIN),
    });
    await runInatividade(agora, slug);
    expect(await readSessao(s.id)).toMatchObject({ status: "closed", abandonType: TIPO_ABANDONO.NA_FILA });
  });
});

describe("fim do dia", () => {
  it("encerra o WhatsApp aberto antes do corte e avisa o cliente", async () => {
    await prisma.botConfig.update({
      where: { workspaceId: slug },
      data: { endOfDayEnabled: true, endOfDayTime: "00:00" },
    });
    const ontem = new Date(Date.now() - 24 * 60 * MIN);
    const aberta = await createSessao({ createdAt: ontem });
    const ligacao = await createSessao({ createdAt: ontem, channel: "phone" });
    await runFimDoDia(new Date(), slug);
    expect(await readSessao(aberta.id)).toMatchObject({ status: "closed", endKind: "fim_do_dia", abandonType: null });
    expect((await textosDoBot(aberta.id)).some((t) => t.includes("Agradecemos seu contato"))).toBe(true);
    expect((await readSessao(ligacao.id)).status).toBe("active");
    await prisma.botConfig.update({ where: { workspaceId: slug }, data: { endOfDayEnabled: false } });
  });

  it("desligado, não encerra nada", async () => {
    const s = await createSessao({ createdAt: new Date(Date.now() - 24 * 60 * MIN) });
    await runFimDoDia(new Date(), slug);
    expect((await readSessao(s.id)).status).toBe("active");
  });
});

describe("pausa do chat do site", () => {
  it("pausa, retoma e vence em 3 dias como abandono tipo 4", async () => {
    const s = await createSessao({ channel: "native", clientPhone: null });
    await pauseAtendimento(s.id);
    expect((await readSessao(s.id)).status).toBe("paused");
    await resumeAtendimento(s.id);
    expect(await readSessao(s.id)).toMatchObject({ status: "active", pausedAt: null });

    await pauseAtendimento(s.id);
    await runPausasVencidas(Date.now() + 4 * 24 * 60 * MIN, slug);
    expect(await readSessao(s.id)).toMatchObject({
      status: "closed",
      endKind: "pausa_vencida",
      abandonType: TIPO_ABANDONO.NAO_VOLTOU_DA_PAUSA,
    });
  });
});

describe("falha de envio ao WhatsApp", () => {
  it("marca a mensagem como falha e o reenvio a entrega", async () => {
    const fora = Bun.serve({ port: 0, fetch: () => new Response("fora do ar", { status: 500 }) });
    await prisma.providerConfig.update({
      where: { workspaceId: slug },
      data: { baseUrl: `http://localhost:${fora.port}` },
    });
    const s = await createSessao();
    const msg = await deliverOutbound(s, { sender: "attendant", type: "text", text: "Olá" });
    const falhou = await prisma.chatMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(falhou.status).toBe("failed");
    expect(falhou.sendError).toBeTruthy();

    await prisma.providerConfig.update({ where: { workspaceId: slug }, data: { baseUrl: zapi.baseUrl } });
    fora.stop(true);
    const reenviada = await resendMessage(msg.id);
    expect(reenviada).toMatchObject({ status: "sent", sendError: null });
    expect(reenviada?.externalId).toBeTruthy();
  });
});

describe("chamado vinculado", () => {
  it("só vincula o chamado aberto a partir desta conversa", async () => {
    const s = await createSessao();
    const outro = crypto.randomUUID();
    const chamado = crypto.randomUUID();
    await Promise.all(
      [
        [chamado, s.id],
        [outro, crypto.randomUUID()],
      ].map(([id, externo]) =>
        prisma.$executeRawUnsafe(
          `INSERT INTO issues (id, updated_at, project_id, workspace_id, name, sequence_id, external_source, external_id)
           VALUES ($1::uuid, now(), $2::uuid, $3::uuid, 'Chamado', 42, 'chat', $4)`,
          id,
          projeto,
          workspaceUuid,
          externo
        )
      )
    );

    expect(await linkChamado(s.id, outro)).toBeNull();
    const vinculada = await linkChamado(s.id, chamado);
    expect(vinculada).toMatchObject({ issueId: chamado, issueProjectId: projeto, issueLabel: "SIA-42" });
  });
});
