/**
 * Painel de TV do atendimento contra o banco, no próprio processo: as conversas
 * caem nas abas certas, a lateral traz os atendentes do espaço e a rota interna
 * só responde com o segredo de serviço.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { painelModule } from "@/painel/rotas";
import { readPainelDeAtendimento } from "@/painel/painel.service";
import {
  cleanWorkspace,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  uniqueWorkspace,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsw18");
const AGORA = new Date();
let atendente: { id: string; email: string };

const HORA = 3_600_000;

async function criarSessao(dados: Record<string, unknown>) {
  const id = crypto.randomUUID();
  await prisma.chatSession.create({
    data: {
      id,
      protocol: `P-${id.slice(0, 8)}`,
      channel: "whatsapp",
      workspaceId: slug,
      clientName: "Maria da Prefeitura",
      clientPhone: "5567999990000",
      createdAt: new Date(AGORA.getTime() - HORA),
      ...dados,
    } as never,
  });
  return id;
}

describe("painel de TV do atendimento", () => {
  beforeAll(async () => {
    atendente = await resolveTestAttendant();
    await ensureAtendenteNoEspaco(slug, atendente.id);
    await cleanWorkspace(slug);
  });

  afterAll(async () => {
    await cleanWorkspace(slug);
    await limparWorkspacePlane(slug);
  });

  it("cada conversa cai na aba do estado dela e traz o tempo daquela aba", async () => {
    await criarSessao({ status: "queued" });
    await criarSessao({ status: "active", assignedAttendantId: atendente.id });
    await criarSessao({
      status: "active",
      assignedAttendantId: atendente.id,
      lastAttendantMessageAt: new Date(AGORA.getTime() - 600_000),
      lastClientMessageAt: new Date(AGORA.getTime() - 300_000),
    });
    await criarSessao({ status: "paused", pausedAt: new Date(AGORA.getTime() - 1800_000) });
    await criarSessao({ status: "closed", endKind: "inatividade", closedAt: AGORA });
    await criarSessao({ status: "closed", endKind: "atendente", closedAt: AGORA });

    const painel = await readPainelDeAtendimento(slug, AGORA);
    const totais = Object.fromEntries(painel.abas.map((a) => [a.chave, a.total]));
    expect(totais).toEqual({
      em_atendimento: 1,
      pausa: 1,
      nao_iniciado: 1,
      espera: 1,
      inativo: 1,
      fechou_chat: 1,
    });
    const emAtendimento = painel.abas.find((a) => a.chave === "em_atendimento")!;
    expect(emAtendimento.linhas[0]).toMatchObject({ tempo_tipo: "parado", atendente: expect.any(String) });
    expect(emAtendimento.linhas[0]!.tempo_seg).toBeGreaterThanOrEqual(300);
    expect(painel.totais).toMatchObject({ abertas: 4, encerradas_hoje: 2 });
  });

  it("quem atende mas não está em fila nenhuma fica fora da lateral", async () => {
    const painel = await readPainelDeAtendimento(slug, AGORA);
    expect(painel.atendentes).toEqual([]);
    expect(painel.totais.atendentes_online).toBe(0);
  });

  it("a lateral traz quem está em fila, com a situação e a carga", async () => {
    const fila = await prisma.queue.create({ data: { workspaceId: slug, name: "Suporte" } });
    await prisma.queueMember.create({ data: { queueId: fila.id, userId: atendente.id } });

    const painel = await readPainelDeAtendimento(slug, AGORA);
    const pessoa = painel.atendentes.find((a) => a.id === atendente.id)!;
    expect(pessoa).toMatchObject({ situacao: "offline", em_atendimento: 2 });
    expect(pessoa.aguardando).toBe(1);
  });

  it("a rota interna exige o segredo de serviço", async () => {
    const original = process.env.CHAT_SERVICE_TOKEN;
    process.env.CHAT_SERVICE_TOKEN = "segredo-do-teste";
    const chamar = (headers: Record<string, string>) =>
      painelModule.handle(new Request(`http://chat.local/internal/painel/${slug}/atendimento/`, { headers }));

    expect((await chamar({})).status).toBe(401);
    expect((await chamar({ "x-service-token": "errado" })).status).toBe(401);
    const ok = await chamar({ "x-service-token": "segredo-do-teste" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).abas).toHaveLength(6);

    delete process.env.CHAT_SERVICE_TOKEN;
    expect((await chamar({ "x-service-token": "segredo-do-teste" })).status).toBe(503);
    process.env.CHAT_SERVICE_TOKEN = original;
  });
});
