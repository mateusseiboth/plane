/**
 * Rotas REST do ciclo de vida e dos relatórios, no próprio processo
 * (`module.handle`), contra o banco: quem pode chamar (matriz de ações),
 * encerramento com entidade obrigatória, pausa, reenvio, vínculo do chamado,
 * catálogo de motivos e os relatórios de atendimento.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cicloDeVidaModule } from "@/ciclo-de-vida/rotas";
import { relatoriosModule } from "@/relatorios/rotas";
import {
  cleanWorkspace,
  configureWorkspace,
  criarEntidade,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsrotas");
let zapi: FakeZapi;
let token: string;
let estranho: string;
let estranhoId: string;
let entidade: string;

type Modulo = { handle: (r: Request) => Promise<Response> };

async function call(modulo: Modulo, method: string, path: string, body?: unknown, auth: string | null = token) {
  const res = await modulo.handle(
    new Request(`http://chat.local${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const createSessao = (dados: Record<string, unknown> = {}) =>
  prisma.chatSession.create({
    data: {
      workspaceId: slug,
      protocol: `R-${crypto.randomUUID().slice(0, 12)}`,
      channel: "native",
      status: "active",
      botState: "done",
      assignedAttendantId: crypto.randomUUID(),
      ...dados,
    },
  });

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  const user = await resolveTestAttendant();
  await ensureAtendenteNoEspaco(slug, user.id);
  token = await signPlaneToken(user.id, user.email);
  // Conta real fora do espaço: um id que não existe em `users` agora dá 401 (sessão revogada).
  const email = `estranho-${slug}@teste.local`;
  const [fora] = (await prisma.$queryRaw`
    INSERT INTO users (id, created_at, updated_at, email, username, display_name, first_name, last_name, password,
                       is_active, is_email_verified, is_password_autoset, is_instance_admin, is_superuser, is_staff)
    VALUES (gen_random_uuid(), now(), now(), ${email}, ${email}, 'Estranho', 'Estranho', '', 'x',
            true, true, false, false, false, false)
    RETURNING id::text AS id`) as Array<{ id: string }>;
  estranhoId = fora!.id;
  estranho = await signPlaneToken(estranhoId, email);
  const [ws] = (await prisma.$queryRaw`SELECT id::text AS id FROM workspaces WHERE slug = ${slug}`) as Array<{
    id: string;
  }>;
  entidade = await criarEntidade(ws!.id, "Câmara de Teste");
});

afterAll(async () => {
  zapi?.stop();
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
  await prisma.$executeRaw`DELETE FROM users WHERE id::text = ${estranhoId}`;
});

describe("encerrar pela API", () => {
  it("sem login 401; sem a ação no espaço 403", async () => {
    const s = await createSessao();
    expect(
      (await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/close/`, {}, null)).status
    ).toBe(401);
    expect(
      (await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/close/`, {}, estranho)).status
    ).toBe(403);
  });

  it("sem entidade: 422 com a mensagem para o atendente", async () => {
    const s = await createSessao();
    const r = await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/close/`, {
      motivo: "Dúvida",
    });
    expect(r.status).toBe(422);
    expect(r.body.detail).toBe("Informe a entidade para encerrar.");
  });

  it("com entidade e motivo: encerra e devolve a sessão classificada", async () => {
    const s = await createSessao();
    const r = await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/close/`, {
      entity_id: entidade,
      motivo: "Senha",
      note: "Senha redefinida.",
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      status: "closed",
      entity_id: entidade,
      close_reason: "Senha",
      close_note: "Senha redefinida.",
    });
  });

  it("conversa de outro espaço: 404", async () => {
    const s = await prisma.chatSession.create({
      data: {
        workspaceId: "outro-espaco",
        protocol: `R-${crypto.randomUUID().slice(0, 12)}`,
        channel: "native",
        status: "active",
      },
    });
    expect(
      (await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/close/`, { entity_id: entidade }))
        .status
    ).toBe(404);
    await prisma.chatSession.delete({ where: { id: s.id } });
  });
});

describe("pausa, reenvio e chamado", () => {
  it("pausa e retoma", async () => {
    const s = await createSessao();
    expect((await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/pause/`)).body.status).toBe(
      "paused"
    );
    expect((await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/resume/`)).body.status).toBe(
      "active"
    );
  });

  it("pausar o que não está em atendimento: 409", async () => {
    const s = await createSessao({ status: "queued" });
    expect((await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/pause/`)).status).toBe(409);
  });

  it("reenvia a mensagem que falhou", async () => {
    const s = await createSessao({ channel: "whatsapp", clientPhone: "5567999991111" });
    const m = await prisma.chatMessage.create({
      data: { sessionId: s.id, sender: "attendant", text: "Oi", status: "failed", sendError: "500" },
    });
    const r = await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/messages/${m.id}/resend/`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: m.id, status: "sent" });
  });

  it("chamado que não é desta conversa: 404", async () => {
    const s = await createSessao();
    const r = await call(cicloDeVidaModule, "POST", `/workspaces/${slug}/sessions/${s.id}/chamado/`, {
      issue_id: crypto.randomUUID(),
    });
    expect(r.status).toBe(404);
  });

  it("catálogo de motivos para o modal", async () => {
    const r = await call(cicloDeVidaModule, "GET", `/workspaces/${slug}/close-reasons/`);
    expect(r.status).toBe(200);
    expect(r.body.results.map((m: { label: string }) => m.label)).toEqual([
      "Acesso",
      "Dúvida",
      "Correção",
      "Melhoria",
      "Senha",
    ]);
  });
});

describe("relatórios", () => {
  it("agregado e registros do período, filtráveis por entidade", async () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const r = await call(relatoriosModule, "GET", `/workspaces/${slug}/reports/atendimentos/?from=${hoje}&to=${hoje}`);
    expect(r.status).toBe(200);
    expect(r.body.finalizacao.total).toBeGreaterThanOrEqual(1);

    const registros = await call(
      relatoriosModule,
      "GET",
      `/workspaces/${slug}/registros/?entity_id=${entidade}&from=${hoje}&to=${hoje}`
    );
    expect(registros.status).toBe(200);
    expect(registros.body.results.length).toBeGreaterThanOrEqual(1);
    expect(registros.body.results.every((x: { entity_id: string }) => x.entity_id === entidade)).toBe(true);
  });

  it("sem chat.gerenciar: 403", async () => {
    expect(
      (await call(relatoriosModule, "GET", `/workspaces/${slug}/reports/atendimentos/`, undefined, estranho)).status
    ).toBe(403);
  });
});
