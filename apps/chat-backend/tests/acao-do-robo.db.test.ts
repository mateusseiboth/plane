/**
 * Passo "ação" do robô de ponta a ponta no processo do teste, contra o banco:
 * menu → fluxo com a ação → perguntas → rota interna do api-ts (um servidor
 * falso que confere o token de serviço) → mensagem de sucesso → encerramento.
 * Cobre ouvidoria (com CNPJ recusado e perguntado de novo), currículo em PDF e
 * o catálogo de destinos da tela de fluxos. Nada sai para o WhatsApp.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { saveMedia } from "@/storage";
import {
  cleanWorkspace,
  configureWorkspace,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsacao");
const TOKEN = "token-de-servico-do-robo";

type Recebido = { path: string; token: string | null; json?: any; form?: FormData };
const recebidos: Recebido[] = [];
let respostaDaOuvidoria: () => Response = () => Response.json({ id: "o1" }, { status: 201 });

const apiFalsa = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const token = req.headers.get("X-Service-Token");
    const isForm = (req.headers.get("Content-Type") ?? "").startsWith("multipart/form-data");
    recebidos.push({
      path: url.pathname,
      token,
      ...(isForm ? { form: await req.formData() } : { json: await req.json().catch(() => null) }),
    });
    if (url.pathname.endsWith("/ouvidoria/")) return respostaDaOuvidoria();
    return Response.json({ id: "c1" }, { status: 201 });
  },
});

// O cliente do api-ts lê o endereço e o token na carga do módulo: definir ANTES do import.
process.env.API_TS_INTERNAL_URL = `http://localhost:${apiFalsa.port}`;
process.env.CHAT_SERVICE_TOKEN = TOKEN;
const { handleInboundClient } = await import("@/bot/engine");
const { destinosModule } = await import("@/bot/acao/rotas");

let zapi: FakeZapi;
let token: string;

const textos = async (sessionId: string) =>
  (await prisma.chatMessage.findMany({ where: { sessionId, sender: "bot" }, orderBy: { createdAt: "asc" } })).map(
    (m) => m.text ?? ""
  );

async function createFluxoNoMenu(tecla: string, steps: unknown[]) {
  const flow = await prisma.botFlow.create({
    data: { workspaceId: slug, name: `Fluxo ${tecla}`, steps: steps as any },
  });
  await prisma.botMenuOption.create({
    data: { workspaceId: slug, key: tecla, label: `Opção ${tecla}`, action: "flow", flowId: flow.id },
  });
}

const createSessaoNoMenu = () =>
  prisma.chatSession.create({
    data: {
      workspaceId: slug,
      protocol: `A-${crypto.randomUUID().slice(0, 12)}`,
      channel: "whatsapp",
      clientPhone: `5567${Math.floor(100000000 + Math.random() * 899999999)}`,
      clientName: "Maria",
      status: "bot",
      botState: "menu",
    },
  });

async function sendCliente(sessionId: string, texto: string, midia?: { key: string; mime: string; name: string }) {
  await prisma.chatMessage.create({
    data: {
      sessionId,
      sender: "client",
      type: midia ? "file" : "text",
      text: texto,
      ...(midia ? { mediaKey: midia.key, mediaMime: midia.mime, mediaName: midia.name } : {}),
    },
  });
  await handleInboundClient(sessionId, texto);
}

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  const user = await resolveTestAttendant();
  await ensureAtendenteNoEspaco(slug, user.id);
  token = await signPlaneToken(user.id, user.email);
  await createFluxoNoMenu("2", [
    { type: "action", destino: "ouvidoria", params: { tipo: "reclamacao" } },
    { type: "close", text: "Até logo." },
  ]);
  await createFluxoNoMenu("5", [
    { type: "action", destino: "curriculo", prompts: { vaga: "Para qual vaga?" } },
    { type: "close" },
  ]);
});

afterAll(async () => {
  zapi?.stop();
  apiFalsa.stop(true);
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
});

describe("ouvidoria pelo robô", () => {
  it("coleta CNPJ e mensagem, registra no api-ts com o token de serviço e encerra", async () => {
    recebidos.length = 0;
    const s = await createSessaoNoMenu();
    await sendCliente(s.id, "2");
    expect((await textos(s.id)).at(-1)).toBe("Digite o CNPJ da entidade, só os números.");

    await sendCliente(s.id, "123");
    expect((await textos(s.id)).slice(-2)).toEqual([
      "Informe o CNPJ com 14 números.",
      "Digite o CNPJ da entidade, só os números.",
    ]);

    await sendCliente(s.id, "12.345.678/0001-90");
    // O nome veio da conversa: vai direto para a mensagem.
    expect((await textos(s.id)).at(-1)).toBe("Escreva a sua mensagem em uma única mensagem.");

    await sendCliente(s.id, "O sistema caiu.");
    expect(recebidos).toHaveLength(1);
    expect(recebidos[0]).toMatchObject({
      path: `/api/internal/chat/workspaces/${slug}/ouvidoria/`,
      token: TOKEN,
      json: {
        kind: "reclamacao",
        cnpj: "12.345.678/0001-90",
        name: "Maria",
        message: "O sistema caiu.",
        chat_session_id: s.id,
      },
    });
    const bot = await textos(s.id);
    expect(bot).toContain("Sua reclamação foi registrada. Obrigado pelo contato.");
    expect(bot).toContain("Até logo.");
    expect((await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("closed");
  });

  it("CNPJ que o api-ts não conhece: pergunta o CNPJ de novo e não encerra", async () => {
    respostaDaOuvidoria = () =>
      Response.json(
        {
          detail: "x",
          errors: [{ path: "cnpj", message: "CNPJ não encontrado. Confira os números e envie de novo." }],
        },
        { status: 400 }
      );
    const s = await createSessaoNoMenu();
    await sendCliente(s.id, "2");
    await sendCliente(s.id, "99999999000199");
    await sendCliente(s.id, "Texto");
    expect((await textos(s.id)).slice(-2)).toEqual([
      "CNPJ não encontrado. Confira os números e envie de novo.",
      "Digite o CNPJ da entidade, só os números.",
    ]);
    const sessao = await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } });
    expect(sessao.status).toBe("bot");
    expect((sessao.flowState as any).__acao).toBe("cnpj");
    respostaDaOuvidoria = () => Response.json({ id: "o1" }, { status: 201 });
  });
});

describe("currículo pelo robô", () => {
  it("recusa o que não é PDF e envia o PDF com nome e vaga", async () => {
    recebidos.length = 0;
    const s = await createSessaoNoMenu();
    await sendCliente(s.id, "5");
    expect((await textos(s.id)).at(-1)).toBe("Para qual vaga?");
    await sendCliente(s.id, "Programador");
    expect((await textos(s.id)).at(-1)).toBe("Envie o seu currículo em PDF, em uma única mensagem.");

    await sendCliente(s.id, "segue");
    expect((await textos(s.id)).slice(-2)).toEqual([
      "O arquivo enviado não é um PDF. Envie o currículo em PDF.",
      "Envie o seu currículo em PDF, em uma única mensagem.",
    ]);

    const key = `testes/${slug}/cv.pdf`;
    await saveMedia(key, Buffer.from("%PDF-1.7 curriculo"));
    await sendCliente(s.id, "", { key, mime: "application/pdf", name: "cv maria.pdf" });

    expect(recebidos).toHaveLength(1);
    const form = recebidos[0]!.form!;
    expect(recebidos[0]!.token).toBe(TOKEN);
    expect(form.get("name")).toBe("Maria");
    expect(form.get("position")).toBe("Programador");
    const arquivo = form.get("file") as File;
    expect(arquivo.name).toBe("cv maria.pdf");
    expect(await arquivo.text()).toBe("%PDF-1.7 curriculo");
    expect((await textos(s.id)).join("\n")).toContain("Currículo recebido.");
    expect((await prisma.chatSession.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("closed");
  });
});

describe("catálogo de destinos para a tela", () => {
  it("lista os destinos com parâmetros e campos; exige login", async () => {
    const semLogin = await destinosModule.handle(
      new Request(`http://chat.local/workspaces/${slug}/config/bot/destinos/`)
    );
    expect(semLogin.status).toBe(401);
    const res = await destinosModule.handle(
      new Request(`http://chat.local/workspaces/${slug}/config/bot/destinos/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    expect(res.status).toBe(200);
    const lista = (await res.json()) as any[];
    expect(lista.map((d) => d.key)).toEqual(["ouvidoria", "curriculo", "responsavel_email"]);
    expect(lista[0].params[0].options.map((o: any) => o.value)).toEqual(["sugestao", "reclamacao"]);
    expect(lista[1].campos.map((c: any) => [c.key, c.kind])).toEqual([
      ["nome", "text"],
      ["vaga", "text"],
      ["arquivo", "file"],
    ]);
  });
});
