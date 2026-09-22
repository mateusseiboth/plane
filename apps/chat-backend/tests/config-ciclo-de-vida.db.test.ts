/**
 * Configuração do ciclo de vida no painel do chat (catálogo de motivos, fim do
 * dia, pergunta de inatividade, token do webhook) e a trilha de auditoria da
 * troca de visibilidade do atendente. No próprio processo, contra o banco.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { configModule } from "@/config-routes";
import {
  cleanWorkspace,
  configureWorkspace,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  waitUntil,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsconfig");
let zapi: FakeZapi;
let token: string;

async function call(method: string, path: string, body?: unknown) {
  const res = await configModule.handle(
    new Request(`http://chat.local${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  const user = await resolveTestAttendant();
  await ensureAtendenteNoEspaco(slug, user.id);
  token = await signPlaneToken(user.id, user.email);
});

afterAll(async () => {
  zapi?.stop();
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
});

describe("configuração do ciclo de vida", () => {
  it("grava catálogo de motivos (limpo), fim do dia e pergunta de inatividade", async () => {
    const r = await call("PATCH", `/workspaces/${slug}/config/bot/`, {
      closeReasons: [{ label: " Acesso " }, { label: "" }, { key: "treino", label: "Treinamento" }],
      endOfDayEnabled: true,
      endOfDayTime: "18:00",
      endOfDayMessage: "Até amanhã.",
      activeIdlePromptMessage: "Ainda está aí? 1 continua, 99 encerra.",
    });
    expect(r.status).toBe(200);
    const cfg = await prisma.botConfig.findUniqueOrThrow({ where: { workspaceId: slug } });
    expect(cfg.closeReasons).toEqual([
      { key: "acesso", label: "Acesso" },
      { key: "treino", label: "Treinamento" },
    ]);
    expect(cfg).toMatchObject({ endOfDayEnabled: true, endOfDayTime: "18:00", endOfDayMessage: "Até amanhã." });
  });

  it("horário do fim do dia inválido é recusado", async () => {
    expect((await call("PATCH", `/workspaces/${slug}/config/bot/`, { endOfDayTime: "25h" })).status).toBe(422);
  });

  it("token do webhook é gravado e nunca devolvido", async () => {
    await call("PATCH", `/workspaces/${slug}/config/provider/`, { webhook_token: "segredo-novo" });
    expect((await prisma.providerConfig.findUniqueOrThrow({ where: { workspaceId: slug } })).webhookToken).toBe(
      "segredo-novo"
    );
    const r = await call("GET", `/workspaces/${slug}/config/provider/`);
    expect(r.body.has_webhook_token).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain("segredo-novo");
  });

  it("token do webhook vazio desliga a exigência", async () => {
    await call("PATCH", `/workspaces/${slug}/config/provider/`, { webhook_token: "" });
    expect((await prisma.providerConfig.findUniqueOrThrow({ where: { workspaceId: slug } })).webhookToken).toBeNull();
  });
});

describe("auditoria da visibilidade do atendente", () => {
  it("registra quem deixou quem invisível", async () => {
    const alvo = crypto.randomUUID();
    const r = await call("PATCH", `/workspaces/${slug}/config/attendants/${alvo}/visibility/`, { is_invisible: true });
    expect(r.status).toBe(200);
    const linha = await waitUntil(async () => {
      const rows = (await prisma.$queryRaw`
        SELECT action, entity, metadata FROM audit_logs
         WHERE entity = 'chat_attendant' AND entity_id = ${alvo} ORDER BY created_at DESC LIMIT 1`) as Array<{
        action: string;
        metadata: any;
      }>;
      return rows[0] ?? null;
    });
    expect(linha).toMatchObject({ action: "update" });
    expect(linha!.metadata).toMatchObject({ is_invisible: true, origem: "chat" });
  });
});
