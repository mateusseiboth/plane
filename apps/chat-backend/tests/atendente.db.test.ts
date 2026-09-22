/**
 * Rotas e serviços do W05 no próprio processo (`module.handle`), contra o banco:
 * frases prontas, chave de acesso, pausa do alerta (e o `checkSla` que não fala
 * mais com o cliente), cadastro durante o atendimento, conversa iniciada pelo
 * responsável, feriados, gerenciador, monitor e a foto do responsável.
 * Z-API falsa; a foto é baixada por um `fetch` injetado.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { atendenteModule } from "@/atendente/rotas";
import { refreshFotoDoResponsavel } from "@/atendente/foto.service";
import { readDataLocal } from "@/atendente/fuso";
import { isWithinBusinessHours } from "@/presence";
import { checkSla } from "@/timers";
import { register, unregister } from "@/ws/hub";
import {
  cleanWorkspace,
  configureWorkspace,
  criarEntidade,
  criarResponsavel,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  signPlaneToken,
  startFakeZapi,
  uniqueWorkspace,
  waitUntil,
  type FakeZapi,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsw05");
const outroSlug = uniqueWorkspace("wsw05outro");
let zapi: FakeZapi;
let admin: { id: string; token: string };
let atendente: { id: string; token: string };
let estranho: { id: string; token: string };
let workspaceUuid: string;
let entidade: string;
let entidadeDeOutroEspaco: string;
let projeto: string;
let responsavel: string;

const MIN = 60_000;

async function call(method: string, path: string, body?: unknown, auth: string | null = admin.token) {
  const res = await atendenteModule.handle(
    new Request(`http://chat.local${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const createUser = async (nome: string) => {
  const email = `${nome}-${slug}@teste.local`;
  const [linha] = (await prisma.$queryRaw`
    INSERT INTO users (id, created_at, updated_at, email, username, display_name, first_name, last_name, password,
                       is_active, is_email_verified, is_password_autoset, is_instance_admin, is_superuser, is_staff)
    VALUES (gen_random_uuid(), now(), now(), ${email}, ${email}, ${nome}, ${nome}, '', 'x',
            true, true, false, false, false, false)
    RETURNING id::text AS id`) as Array<{ id: string }>;
  return { id: linha!.id, token: await signPlaneToken(linha!.id, email) };
};

const createSessao = (dados: Record<string, unknown> = {}) =>
  prisma.chatSession.create({
    data: {
      workspaceId: slug,
      protocol: `W5-${crypto.randomUUID().slice(0, 12)}`,
      channel: "native",
      status: "active",
      botState: "done",
      assignedAttendantId: admin.id,
      ...dados,
    },
  });

beforeAll(async () => {
  zapi = startFakeZapi();
  await configureWorkspace(slug, zapi.baseUrl);
  const user = await resolveTestAttendant();
  admin = { id: user.id, token: await signPlaneToken(user.id, user.email) };
  await ensureAtendenteNoEspaco(slug, admin.id);
  atendente = await createUser("atendente");
  estranho = await createUser("estranho");
  const [ws] = (await prisma.$queryRaw`SELECT id::text AS id FROM workspaces WHERE slug = ${slug}`) as Array<{
    id: string;
  }>;
  workspaceUuid = ws!.id;
  // Função só com `chat.atender`: atende, mas não configura nem gerencia.
  await prisma.$executeRaw`
    INSERT INTO workflow_roles (id, created_at, updated_at, workspace_id, name, key, level, is_system, permissions)
    VALUES (gen_random_uuid(), now(), now(), ${workspaceUuid}::uuid, 'Atendimento', 'atendimento', 6, true,
            '["chat.atender"]'::jsonb)`;
  await prisma.$executeRaw`
    INSERT INTO workspace_members (id, created_at, updated_at, workspace_id, member_id, role, is_active)
    VALUES (gen_random_uuid(), now(), now(), ${workspaceUuid}::uuid, ${atendente.id}::uuid, 6, true)`;
  entidade = await criarEntidade(workspaceUuid, "Prefeitura de Teste");
  await ensureAtendenteNoEspaco(outroSlug, admin.id);
  const [outro] = (await prisma.$queryRaw`SELECT id::text AS id FROM workspaces WHERE slug = ${outroSlug}`) as Array<{
    id: string;
  }>;
  entidadeDeOutroEspaco = await criarEntidade(outro!.id, "Entidade de fora");
  projeto = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO projects (id, created_at, updated_at, workspace_id, name, identifier)
    VALUES (${projeto}::uuid, now(), now(), ${workspaceUuid}::uuid, 'SIART', 'SIA')`;
  responsavel = await criarResponsavel(workspaceUuid, {
    nome: "Maria Responsável",
    telefone: "67999887766",
    entityId: entidade,
  });
  await prisma.$executeRaw`
    INSERT INTO entity_contact_projects (id, created_at, contact_id, project_id, workspace_id)
    VALUES (gen_random_uuid(), now(), ${responsavel}::uuid, ${projeto}::uuid, ${workspaceUuid}::uuid)`;
});

afterAll(async () => {
  zapi?.stop();
  await prisma.chatFrasePronta.deleteMany({ where: { workspaceId: slug } });
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
  await limparWorkspacePlane(outroSlug);
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${slug}@teste.local`}`;
});

describe("frases prontas", () => {
  it("quem não é do espaço: 403; sem login: 401", async () => {
    expect((await call("GET", `/workspaces/${slug}/frases/`, undefined, null)).status).toBe(401);
    expect((await call("GET", `/workspaces/${slug}/frases/`, undefined, estranho.token)).status).toBe(403);
  });

  it("o administrador cria, edita, lista em ordem e apaga", async () => {
    const b = await call("POST", `/workspaces/${slug}/config/frases/`, { texto: "Bom dia!", ordem: 2 });
    expect(b.status).toBe(201);
    const a = await call("POST", `/workspaces/${slug}/config/frases/`, { texto: "Aguarde.", ordem: 1 });
    expect((await call("GET", `/workspaces/${slug}/frases/`, undefined, atendente.token)).body.results).toMatchObject([
      { texto: "Aguarde.", ordem: 1 },
      { texto: "Bom dia!", ordem: 2 },
    ]);
    const editada = await call("PATCH", `/workspaces/${slug}/config/frases/${a.body.id}/`, {
      texto: "Aguarde, por favor.",
    });
    expect(editada.body).toMatchObject({ id: a.body.id, texto: "Aguarde, por favor.", ordem: 1 });
    expect((await call("DELETE", `/workspaces/${slug}/config/frases/${b.body.id}/`)).status).toBe(200);
    expect((await call("GET", `/workspaces/${slug}/frases/`)).body.results).toHaveLength(1);
    await call("DELETE", `/workspaces/${slug}/config/frases/${a.body.id}/`);
  });

  it("texto vazio volta no campo", async () => {
    const r = await call("POST", `/workspaces/${slug}/config/frases/`, { texto: "" });
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ path: "texto", message: "Informe o texto da frase." }]);
  });

  it("quem só atende não configura", async () => {
    expect((await call("POST", `/workspaces/${slug}/config/frases/`, { texto: "x" }, atendente.token)).status).toBe(
      403
    );
  });

  it("as frases padrão entram uma vez só", async () => {
    const primeira = await call("POST", `/workspaces/${slug}/config/frases/padrao/`);
    expect(primeira.status).toBe(200);
    expect(primeira.body.results).toHaveLength(7);
    expect((await call("POST", `/workspaces/${slug}/config/frases/padrao/`)).body.results).toHaveLength(7);
    await prisma.chatFrasePronta.deleteMany({ where: { workspaceId: slug } });
  });
});

describe("chave de acesso remoto", () => {
  it("sem chave: 400 no campo", async () => {
    const s = await createSessao();
    const r = await call("POST", `/workspaces/${slug}/sessions/${s.id}/chave/`, { chave: " " });
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ path: "chave", message: "Informe a chave de acesso." }]);
  });

  it("conversa de outro espaço: 404", async () => {
    const s = await createSessao({ workspaceId: outroSlug });
    expect((await call("POST", `/workspaces/${slug}/sessions/${s.id}/chave/`, { chave: "1" })).status).toBe(404);
    await prisma.chatSession.delete({ where: { id: s.id } });
  });

  it("no site vira mensagem do tipo chave", async () => {
    const s = await createSessao();
    const r = await call("POST", `/workspaces/${slug}/sessions/${s.id}/chave/`, { chave: "123 456 789" });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: "chave", text: "123 456 789", sender: "attendant" });
  });

  it("no WhatsApp vai em negrito, com ou sem o nome do atendente", async () => {
    const s = await createSessao({ channel: "whatsapp", clientPhone: "5567999000111" });
    zapi.reset();
    await call("POST", `/workspaces/${slug}/sessions/${s.id}/chave/`, { chave: "AB-12" });
    const comNome = await zapi.waitFor((c) => c.action === "send-text");
    expect(comNome.body.message).toMatch(/^\*.+\*:\nChave de acesso remoto: \*AB-12\*$/);
    zapi.reset();
    await call("POST", `/workspaces/${slug}/sessions/${s.id}/chave/`, { chave: "CD-34", without_sender_name: true });
    const semNome = await zapi.waitFor((c) => c.action === "send-text");
    expect(semNome.body.message).toBe("Chave de acesso remoto: *CD-34*");
  });
});

describe("alerta de cliente sem resposta", () => {
  it("pausar e retomar o alerta da conversa", async () => {
    const s = await createSessao();
    const pausada = await call("POST", `/workspaces/${slug}/sessions/${s.id}/sla-alert/pause/`);
    expect(pausada.status).toBe(200);
    expect(pausada.body.sla_alert_paused_until).not.toBeNull();
    const retomada = await call("POST", `/workspaces/${slug}/sessions/${s.id}/sla-alert/resume/`);
    expect(retomada.body.sla_alert_paused_until).toBeNull();
  });

  it("o alerta vai só ao atendente, nunca ao cliente, e respeita a pausa", async () => {
    const velha = new Date(Date.now() - 15 * MIN);
    const esperando = await createSessao({ lastClientMessageAt: velha, assignedAttendantId: atendente.id });
    const pausada = await createSessao({
      lastClientMessageAt: velha,
      assignedAttendantId: atendente.id,
      slaAlertPausedAt: new Date(),
    });
    const recebidos: Array<{ quem: string; payload: any }> = [];
    const sockets = [
      { id: `c-${esperando.id}`, kind: "client" as const, sessionId: esperando.id },
      { id: `c-${pausada.id}`, kind: "client" as const, sessionId: pausada.id },
      { id: `a-${atendente.id}`, kind: "attendant" as const, userId: atendente.id },
    ];
    for (const s of sockets)
      register({
        ...s,
        workspaceId: slug,
        send: (payload) => recebidos.push({ quem: s.kind, payload }),
        alive: true,
        lastPongAt: Date.now(),
      });
    try {
      await checkSla();
    } finally {
      for (const s of sockets) unregister(s.id);
    }
    const alertas = recebidos.filter((r) => r.payload?.type === "alert.sla");
    expect(alertas.map((a) => [a.quem, a.payload.session_id])).toEqual([["attendant", esperando.id]]);
  });
});

describe("cadastro durante o atendimento", () => {
  it("define entidade e sistema e devolve com os nomes", async () => {
    const s = await createSessao();
    const r = await call("PATCH", `/workspaces/${slug}/sessions/${s.id}/cadastro/`, {
      entity_id: entidade,
      project_id: projeto,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      entity: { id: entidade, name: "Prefeitura de Teste" },
      project: { id: projeto, identifier: "SIA", name: "SIART" },
      session: { entity_id: entidade, project_id: projeto, project_identifier: "SIA" },
    });
  });

  it("responsável escolhido traz a entidade dele", async () => {
    const s = await createSessao();
    const r = await call("PATCH", `/workspaces/${slug}/sessions/${s.id}/cadastro/`, { entity_contact_id: responsavel });
    expect(r.body).toMatchObject({
      entity: { id: entidade },
      responsavel: { id: responsavel, name: "Maria Responsável", entity_id: entidade },
    });
  });

  it("id inválido ou de outro espaço volta no campo", async () => {
    const s = await createSessao();
    const invalido = await call("PATCH", `/workspaces/${slug}/sessions/${s.id}/cadastro/`, { entity_id: "x" });
    expect(invalido.status).toBe(400);
    expect(invalido.body.errors).toEqual([{ path: "entity_id", message: "Entidade inválida." }]);
    const deFora = await call("PATCH", `/workspaces/${slug}/sessions/${s.id}/cadastro/`, {
      entity_id: entidadeDeOutroEspaco,
    });
    expect(deFora.status).toBe(400);
    expect(deFora.body.errors).toEqual([{ path: "entity_id", message: "Entidade não encontrada neste espaço." }]);
  });

  it("vazio limpa", async () => {
    const s = await createSessao({ entityId: entidade });
    const r = await call("PATCH", `/workspaces/${slug}/sessions/${s.id}/cadastro/`, { entity_id: "" });
    expect(r.body.entity).toBeNull();
  });

  it("a leitura traz os dados técnicos do cliente", async () => {
    const s = await createSessao({ clientInfo: { versao: "3.1", so: "Windows 11" } });
    const r = await call("GET", `/workspaces/${slug}/sessions/${s.id}/cadastro/`, undefined, atendente.token);
    expect(r.body.session.client_info).toEqual({ versao: "3.1", so: "Windows 11" });
  });
});

describe("conversa de WhatsApp a partir do responsável", () => {
  it("abre com entidade e sistema do cadastro e manda a primeira mensagem", async () => {
    zapi.reset();
    const r = await call("POST", `/workspaces/${slug}/sessions/whatsapp/responsavel/`, {
      entity_contact_id: responsavel,
      message: "Olá, Maria!",
    });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      channel: "whatsapp",
      status: "active",
      client_name: "Maria Responsável",
      client_phone: "5567999887766",
      entity_contact_id: responsavel,
      entity_id: entidade,
      project_id: projeto,
      assigned_attendant_id: admin.id,
    });
    const envio = await zapi.waitFor((c) => c.action === "send-text");
    expect(envio.body.phone).toBe("5567999887766");
  });

  it("já existe conversa aberta com o número: 409 com a conversa", async () => {
    const r = await call("POST", `/workspaces/${slug}/sessions/whatsapp/responsavel/`, {
      entity_contact_id: responsavel,
    });
    expect(r.status).toBe(409);
    expect(r.body.session_id).toBeTruthy();
  });

  it("responsável sem telefone volta no campo", async () => {
    const semTelefone = await criarResponsavel(workspaceUuid, { nome: "Sem Fone" });
    const r = await call("POST", `/workspaces/${slug}/sessions/whatsapp/responsavel/`, {
      entity_contact_id: semTelefone,
    });
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ path: "entity_contact_id", message: "Este responsável não tem telefone." }]);
  });
});

describe("feriados", () => {
  it("grava, lê e fecha o atendimento no dia", async () => {
    const hoje = readDataLocal(new Date(), "UTC");
    expect(await isWithinBusinessHours(slug)).toBe(true);
    const invalido = await call("PUT", `/workspaces/${slug}/config/feriados/`, {
      feriados: [{ date: "x", label: "" }],
    });
    expect(invalido.status).toBe(400);
    const r = await call("PUT", `/workspaces/${slug}/config/feriados/`, {
      feriados: [{ date: hoje, label: "Feriado de teste" }],
    });
    expect(r.status).toBe(200);
    expect((await call("GET", `/workspaces/${slug}/config/feriados/`)).body.results).toEqual([
      { date: hoje, label: "Feriado de teste", recorrente: false },
    ]);
    expect(await isWithinBusinessHours(slug)).toBe(false);
    await call("PUT", `/workspaces/${slug}/config/feriados/`, { feriados: [] });
    expect(await isWithinBusinessHours(slug)).toBe(true);
  });

  it("quem só atende não altera", async () => {
    expect((await call("PUT", `/workspaces/${slug}/config/feriados/`, { feriados: [] }, atendente.token)).status).toBe(
      403
    );
  });
});

describe("gerenciador de conversas", () => {
  it("só quem gerencia", async () => {
    expect((await call("GET", `/workspaces/${slug}/gerenciador/`, undefined, atendente.token)).status).toBe(403);
  });

  it("filtra, pagina e traz o histórico antigo", async () => {
    const antiga = new Date("2025-01-10T12:00:00Z");
    await createSessao({
      status: "closed",
      createdAt: antiga,
      closedAt: antiga,
      entityId: entidade,
      clientPhone: "556711",
    });
    await createSessao({ status: "closed", createdAt: antiga, closedAt: antiga, assignedAttendantId: atendente.id });
    const todos = await call("GET", `/workspaces/${slug}/gerenciador/?from=2025-01-10&to=2025-01-10&per_page=1`);
    expect(todos.status).toBe(200);
    expect(todos.body).toMatchObject({ count: 2, page: 1, per_page: 1, total_pages: 2 });
    expect(todos.body.results).toHaveLength(1);
    const porEntidade = await call(
      "GET",
      `/workspaces/${slug}/gerenciador/?entity_id=${entidade}&from=2025-01-01&to=2025-12-31`
    );
    expect(porEntidade.body.count).toBe(1);
    expect(porEntidade.body.results[0]).toMatchObject({ entity_name: "Prefeitura de Teste", client_phone: "556711" });
    const porAtendente = await call(
      "GET",
      `/workspaces/${slug}/gerenciador/?attendant_id=${atendente.id}&to=2025-12-31`
    );
    expect(porAtendente.body.results.map((r: any) => r.attendant_name)).toEqual(["atendente"]);
  });
});

describe("monitor ao vivo", () => {
  it("só quem gerencia", async () => {
    expect((await call("GET", `/workspaces/${slug}/monitor/`, undefined, atendente.token)).status).toBe(403);
  });

  it("fila com espera, ativos com tempo parado, abandono do dia e tempos", async () => {
    const agora = Date.now();
    const naFila = await createSessao({
      status: "queued",
      assignedAttendantId: null,
      createdAt: new Date(agora - 7 * MIN),
    });
    const parada = await createSessao({
      lastClientMessageAt: new Date(agora - 12 * MIN),
      lastAttendantMessageAt: new Date(agora - 20 * MIN),
    });
    await createSessao({ status: "closed", closedAt: new Date(), endKind: "inatividade", abandonType: 5 });
    const r = await call("GET", `/workspaces/${slug}/monitor/`);
    expect(r.status).toBe(200);
    const fila = r.body.fila.find((f: any) => f.id === naFila.id);
    expect(fila.espera_seg).toBeGreaterThanOrEqual(7 * 60 - 1);
    const ativa = r.body.ativos.find((a: any) => a.id === parada.id);
    expect(ativa).toMatchObject({ aguardando: "atendente" });
    expect(ativa.parado_seg).toBeGreaterThanOrEqual(12 * 60 - 1);
    expect(r.body.hoje.abandonados).toBeGreaterThanOrEqual(1);
    expect(r.body.hoje.por_tipo_abandono).toContainEqual(expect.objectContaining({ tipo: 5 }));
    expect(r.body.tempos).toHaveProperty("fila");
    expect(r.body.tempos).toHaveProperty("resposta");
  });
});

describe("foto do responsável", () => {
  it("copia a foto do WhatsApp e só busca de novo depois de 30 dias", async () => {
    let downloads = 0;
    const baixar = async () => {
      downloads += 1;
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { "Content-Type": "image/jpeg" } });
    };
    await refreshFotoDoResponsavel(slug, responsavel, "https://pps.whatsapp.net/v/foto.jpg", { baixar });
    const [linha] =
      (await prisma.$queryRaw`SELECT photo FROM entity_contacts WHERE id = ${responsavel}::uuid`) as Array<{
        photo: string;
      }>;
    expect(linha!.photo).toMatch(/\/media\/responsaveis\/.+\.jpg\?mime=image%2Fjpeg&v=\d+$/);
    await refreshFotoDoResponsavel(slug, responsavel, "https://pps.whatsapp.net/v/foto.jpg", { baixar });
    expect(downloads).toBe(1);
  });

  it("link que não é https, ou resposta que não é imagem, não grava nada", async () => {
    const outro = await criarResponsavel(workspaceUuid, { nome: "Sem foto" });
    await refreshFotoDoResponsavel(slug, outro, "http://inseguro/foto.jpg", {
      baixar: async () => new Response("x", { headers: { "Content-Type": "image/jpeg" } }),
    });
    await refreshFotoDoResponsavel(slug, outro, "https://pps.whatsapp.net/v/x", {
      baixar: async () => new Response("<html>", { headers: { "Content-Type": "text/html" } }),
    });
    const foto = await waitUntil(async () => {
      const [l] = (await prisma.$queryRaw`SELECT photo FROM entity_contacts WHERE id = ${outro}::uuid`) as Array<{
        photo: string | null;
      }>;
      return l?.photo ?? "vazia";
    }, 300);
    expect(foto).toBe("vazia");
  });
});
