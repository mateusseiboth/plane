/**
 * Registro de ligações do FreePBX, ponta a ponta: configuração (token e
 * ramais), entrada do PBX, assumir, concluir, vincular chamado, histórico do
 * cliente, filtro por canal e relatórios.
 *
 * Pré-requisitos: chat-backend em execução (CHAT_URL) contra o MESMO banco,
 * com as migrações do api-ts e do chat aplicadas e o seed do api-ts rodado.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  CHAT_URL,
  cleanWorkspace,
  connectAttendant,
  criarEntidade,
  criarResponsavel,
  criarWorkspacePlane,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  prisma,
  resolveTestAttendant,
  signPlaneToken,
  uniqueWorkspace,
  type AttendantSocket,
} from "@tests/helpers/harness";

const workspace = uniqueWorkspace("wslig");
const telefoneConhecido = "5567988820001";

let usuario: { id: string; email: string };
let token: string;
let pbxToken: string;
let atendente: AttendantSocket;
let workspaceId: string;
let entidadeId: string;
let responsavelId: string;
let projetoId: string;
let issueId: string;

const auth = () => ({ Authorization: `Bearer ${token}` });
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

async function call(method: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CHAT_URL}${path}`, { method, ...init });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}

const postLigacao = (body: unknown, headers: Record<string, string> = { "X-Api-Token": pbxToken }) =>
  call("POST", `/workspaces/${workspace}/telefonia/ligacoes/`, json(body, headers));

const callId = () => `call-${crypto.randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  usuario = await resolveTestAttendant();
  token = await signPlaneToken(usuario.id, usuario.email);
  workspaceId = await criarWorkspacePlane(workspace);
  await ensureAtendenteNoEspaco(workspace, usuario.id);
  entidadeId = await criarEntidade(workspaceId, "Prefeitura da Ligação");
  responsavelId = await criarResponsavel(workspaceId, {
    nome: "Carla Responsável",
    telefone: telefoneConhecido,
    entityId: entidadeId,
  });
  projetoId = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO projects (id, created_at, updated_at, workspace_id, name, identifier)
    VALUES (${projetoId}::uuid, now(), now(), ${workspaceId}::uuid, 'Sistema Teste', 'SIST')`;
  issueId = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO issues (id, created_at, updated_at, workspace_id, project_id, name, sequence_id)
    VALUES (${issueId}::uuid, now(), now(), ${workspaceId}::uuid, ${projetoId}::uuid, 'Chamado da ligação', 42)`;
  atendente = await connectAttendant(workspace, token);
}, 30000);

afterAll(async () => {
  atendente?.close();
  await prisma.chatLigacao.deleteMany({ where: { workspaceId: workspace } });
  await prisma.chatRamal.deleteMany({ where: { workspaceId: workspace } });
  await prisma.chatTelefoniaConfig.deleteMany({ where: { workspaceId: workspace } });
  await cleanWorkspace(workspace);
  await limparWorkspacePlane(workspace);
});

describe("configuração de telefonia", () => {
  test("gera o token uma vez e depois só mostra o final", async () => {
    const vazio = await call("GET", `/workspaces/${workspace}/config/telefonia/`, { headers: auth() });
    expect(vazio.status).toBe(200);
    expect(vazio.body.has_token).toBe(false);

    const gerado = await call("POST", `/workspaces/${workspace}/config/telefonia/token/`, { headers: auth() });
    expect(gerado.status).toBe(201);
    pbxToken = gerado.body.token;
    expect(pbxToken.startsWith("pbx_")).toBe(true);

    const lido = await call("GET", `/workspaces/${workspace}/config/telefonia/`, { headers: auth() });
    expect(lido.body.has_token).toBe(true);
    expect(lido.body.token_last4).toBe(pbxToken.slice(-4));
    expect(JSON.stringify(lido.body)).not.toContain(pbxToken);
  });

  test("quem não administra o chat não configura", async () => {
    const estranho = await signPlaneToken(crypto.randomUUID());
    const r = await call("POST", `/workspaces/${workspace}/config/telefonia/token/`, {
      headers: { Authorization: `Bearer ${estranho}` },
    });
    expect(r.status).toBe(403);
  });

  test("ramal de quem não atende volta para o campo", async () => {
    const r = await call(
      "PUT",
      `/workspaces/${workspace}/config/telefonia/ramais/`,
      json({ ramais: [{ extension: "201", user_id: crypto.randomUUID() }] }, auth())
    );
    expect(r.status).toBe(400);
    expect(r.body.errors).toEqual([{ path: "ramais[0].user_id", message: expect.any(String) }]);
  });

  test("grava o ramal de quem atende", async () => {
    const r = await call(
      "PUT",
      `/workspaces/${workspace}/config/telefonia/ramais/`,
      json({ ramais: [{ extension: "201", user_id: usuario.id }] }, auth())
    );
    expect(r.status).toBe(200);
    expect(r.body.ramais).toEqual([expect.objectContaining({ extension: "201", user_id: usuario.id })]);
  });
});

describe("entrada do PBX", () => {
  test("sem token ou com token errado é 401", async () => {
    expect((await postLigacao({ call_id: callId() }, {})).status).toBe(401);
    expect((await postLigacao({ call_id: callId() }, { Authorization: "Bearer pbx_errado" })).status).toBe(401);
  });

  test("payload inválido devolve o campo recusado", async () => {
    const r = await postLigacao({ duration_sec: -1 });
    expect(r.status).toBe(400);
    expect(r.body.errors.map((e: any) => e.path).toSorted()).toEqual(["call_id", "duration_sec"]);
  });

  test("atendida no ramal: identifica o responsável, atribui e avisa pelo WS", async () => {
    const id = callId();
    const r = await postLigacao(
      {
        call_id: id,
        caller: telefoneConhecido,
        extension: "201",
        started_at: "2026-09-22T13:00:00Z",
        status: "ANSWERED",
      },
      { Authorization: `Bearer ${pbxToken}` }
    );
    expect(r.status).toBe(201);
    expect(r.body.session).toMatchObject({
      channel: "phone",
      status: "active",
      assigned_attendant_id: usuario.id,
      entity_contact_id: responsavelId,
      client_name: "Carla Responsável",
    });
    expect(r.body.ligacao).toMatchObject({ call_id: id, extension: "201", status: "answered" });
    await atendente.waitFor((e) => e.type === "session.assigned" && e.session_id === r.body.session.id);
  });

  test("reenvio do mesmo call_id atualiza fim, duração e gravação", async () => {
    const id = callId();
    const primeiro = await postLigacao({ call_id: id, caller: "556799990000", extension: "201" });
    const segundo = await postLigacao({
      call_id: id,
      ended_at: "2026-09-22T13:05:00Z",
      duration_sec: 300,
      recording_url: "https://pbx.local/rec/1.wav",
    });
    expect(primeiro.status).toBe(201);
    expect(segundo.status).toBe(200);
    expect(segundo.body.session.id).toBe(primeiro.body.session.id);
    expect(segundo.body.ligacao).toMatchObject({
      duration_sec: 300,
      recording_url: "https://pbx.local/rec/1.wav",
      ended_at: "2026-09-22T13:05:00.000Z",
    });
    expect(await prisma.chatLigacao.count({ where: { workspaceId: workspace, callId: id } })).toBe(1);
  });

  test("não atendida já entra encerrada", async () => {
    const r = await postLigacao({ call_id: callId(), caller: "556799990001", status: "NO ANSWER" });
    expect(r.status).toBe(201);
    expect(r.body.session.status).toBe("closed");
  });

  test("ramal desconhecido espera alguém assumir, e a fila automática não pega", async () => {
    const r = await postLigacao({ call_id: callId(), caller: "556799990002", extension: "999" });
    expect(r.body.session).toMatchObject({ status: "queued", assigned_attendant_id: null });

    // Conectar um atendente drena a fila do chat: a ligação tem de continuar lá.
    const outro = await connectAttendant(workspace, token);
    await Bun.sleep(500);
    outro.close();
    const sessao = await prisma.chatSession.findUnique({ where: { id: r.body.session.id } });
    expect(sessao).toMatchObject({ status: "queued", assignedAttendantId: null });
  });
});

describe("atendente", () => {
  test("assume a ligação sem atendente", async () => {
    const criada = await postLigacao({ call_id: callId(), caller: "556799990003" });
    const sid = criada.body.session.id;
    const r = await call("POST", `/workspaces/${workspace}/ligacoes/${sid}/assumir/`, { headers: auth() });
    expect(r.status).toBe(200);
    expect(r.body.session).toMatchObject({ status: "active", assigned_attendant_id: usuario.id });
  });

  test("não assume ligação que já é de outra pessoa", async () => {
    const criada = await postLigacao({ call_id: callId(), caller: "556799990004" });
    const sid = criada.body.session.id;
    await prisma.chatSession.update({
      where: { id: sid },
      data: { assignedAttendantId: crypto.randomUUID(), status: "active" },
    });
    const r = await call("POST", `/workspaces/${workspace}/ligacoes/${sid}/assumir/`, { headers: auth() });
    expect(r.status).toBe(409);
  });

  test("concluir exige sistema, descrição e, sem contato detectado, o contato", async () => {
    const criada = await postLigacao({ call_id: callId(), caller: "556799990005", extension: "201" });
    const sid = criada.body.session.id;
    const r = await call("POST", `/workspaces/${workspace}/ligacoes/${sid}/concluir/`, json({}, auth()));
    expect(r.status).toBe(400);
    expect(r.body.errors.map((e: any) => e.path).toSorted()).toEqual(["contact", "descricao", "project_id"]);
  });

  let concluida: string;

  test("conclui, encerra e registra quem concluiu", async () => {
    const criada = await postLigacao({ call_id: callId(), caller: telefoneConhecido, extension: "201" });
    concluida = criada.body.session.id;
    const r = await call(
      "POST",
      `/workspaces/${workspace}/ligacoes/${concluida}/concluir/`,
      json({ project_id: projetoId, descricao: "Não conseguia emitir a guia." }, auth())
    );
    expect(r.status).toBe(200);
    expect(r.body.session).toMatchObject({ status: "closed", project_id: projetoId, project_identifier: "SIST" });
    expect(r.body.ligacao).toMatchObject({ descricao: "Não conseguia emitir a guia.", concluded_by_id: usuario.id });

    const again = await call(
      "POST",
      `/workspaces/${workspace}/ligacoes/${concluida}/concluir/`,
      json({ project_id: projetoId, descricao: "de novo" }, auth())
    );
    expect(again.status).toBe(409);
  });

  test("detalhe traz a ligação, o responsável e a entidade", async () => {
    const r = await call("GET", `/workspaces/${workspace}/ligacoes/${concluida}/`, { headers: auth() });
    expect(r.status).toBe(200);
    expect(r.body.responsavel).toMatchObject({
      id: responsavelId,
      entity_id: entidadeId,
      entity_name: "Prefeitura da Ligação",
    });
  });

  test("vincula o chamado criado e guarda o número", async () => {
    const r = await call(
      "POST",
      `/workspaces/${workspace}/ligacoes/${concluida}/chamado/`,
      json({ kind: "intake", issue_id: issueId }, auth())
    );
    expect(r.status).toBe(200);
    expect(r.body.ligacao).toMatchObject({
      ticket_kind: "intake",
      ticket_id: issueId,
      ticket_project_id: projetoId,
      ticket_label: "SIST-42",
    });

    const inexistente = await call(
      "POST",
      `/workspaces/${workspace}/ligacoes/${concluida}/chamado/`,
      json({ kind: "issue", issue_id: crypto.randomUUID() }, auth())
    );
    expect(inexistente.status).toBe(404);
  });

  test("histórico do cliente junta conversas e ligações", async () => {
    await prisma.chatSession.create({
      data: {
        workspaceId: workspace,
        channel: "whatsapp",
        protocol: `T-${crypto.randomUUID().slice(0, 8)}`,
        clientPhone: telefoneConhecido,
        entityContactId: responsavelId,
        status: "closed",
        assignedAttendantId: usuario.id,
      },
    });
    const r = await call("GET", `/workspaces/${workspace}/sessions/${concluida}/historico-do-cliente/`, {
      headers: auth(),
    });
    expect(r.status).toBe(200);
    const canais = new Set(r.body.results.map((s: any) => s.channel));
    expect(canais).toEqual(new Set(["phone", "whatsapp"]));
    const ligacao = r.body.results.find((s: any) => s.id === concluida);
    expect(ligacao.ligacao).toMatchObject({ descricao: "Não conseguia emitir a guia.", ticket_label: "SIST-42" });
  });
});

describe("lista e relatórios", () => {
  test("filtro por canal na lista de sessões", async () => {
    const ligacoes = await call("GET", `/workspaces/${workspace}/sessions/?channel=phone`, { headers: auth() });
    expect(ligacoes.body.results.length).toBeGreaterThan(0);
    expect(ligacoes.body.results.every((s: any) => s.channel === "phone")).toBe(true);

    const conversas = await call(
      "GET",
      `/workspaces/${workspace}/sessions/?channel=whatsapp,native&q=${telefoneConhecido}`,
      {
        headers: auth(),
      }
    );
    expect(conversas.body.results.length).toBeGreaterThan(0);
    expect(conversas.body.results.some((s: any) => s.channel === "phone")).toBe(false);
  });

  test("relatório conta ligações por atendente, entidade e sistema", async () => {
    const r = await call("GET", `/workspaces/${workspace}/reports/ligacoes/?days=30`, { headers: auth() });
    expect(r.status).toBe(200);
    expect(r.body.missed).toBe(1);
    expect(r.body.by_attendant).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: usuario.id, name: expect.any(String) })])
    );
    expect(r.body.by_entity).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: entidadeId, name: "Prefeitura da Ligação" })])
    );
    expect(r.body.by_system).toEqual(expect.arrayContaining([{ id: projetoId, name: "Sistema Teste", count: 1 }]));
  });

  test("ligação fica fora do SLA de primeira resposta", async () => {
    const r = await call("GET", `/workspaces/${workspace}/reports/sla/?days=30`, { headers: auth() });
    const ligacoes = await prisma.chatSession.count({
      where: { workspaceId: workspace, channel: "phone", assignedAttendantId: { not: null } },
    });
    expect(ligacoes).toBeGreaterThan(0);
    // Só a conversa de WhatsApp do histórico entra na conta.
    expect(r.body.overall.count).toBe(1);
  });
});
