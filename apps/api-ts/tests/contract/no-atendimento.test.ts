/**
 * Etapa "No atendimento" (testes da nova intranet 3, 19/11/2026): o pedido do
 * portal (e o criado a partir da ouvidoria) nasce com o Atendimento, não na
 * triagem da Qualidade. O Atendimento encaminha para a triagem, e aí segue o
 * fluxo normal, ou encerra ali mesmo com uma resposta que vai para o cliente.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";

const SENHA = "portal-secreto-123";
const NO_ATENDIMENTO = -3;
const PENDENTE = -2;
const ATENDIDA = 3;

let wsId: string;
let wsSlug: string;
let base: string;
let projetoId: string;
let tokenDoCliente: string;
let admin: ReturnType<typeof apiClient>;
let qualidade: { user: { id: string }; api: ReturnType<typeof apiClient> };
let atendente: { user: { id: string }; api: ReturnType<typeof apiClient> };

const portal = (token = "") => {
  const raiz = `${TEST_API_BASE_URL}/portal/api`;
  const cabecalhos = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  return {
    get: (caminho: string) => fetch(`${raiz}${caminho}`, { headers: cabecalhos }),
    post: (caminho: string, body: unknown) =>
      fetch(`${raiz}${caminho}`, { method: "POST", headers: cabecalhos, body: JSON.stringify(body) }),
  };
};

const createPessoa = async (key: string) => {
  const user = await createUser();
  const funcao = await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId: wsId, key, deletedAt: null } });
  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id, isActive: true },
  });
  await prisma.projectMember.create({
    data: { projectId: projetoId, workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id },
  });
  return { user, api: apiClient((await createApiToken(user.id)).token) };
};

const abrirPeloPortal = async (titulo: string): Promise<string> => {
  const res = await portal(tokenDoCliente).post("/solicitacoes", { sistema_id: projetoId, titulo });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
};

const readStatus = async (issueId: string) =>
  (await prisma.intakeIssue.findFirstOrThrow({ where: { issueId, deletedAt: null } })).status;

const avisosDe = (receiverId: string, issueId: string) =>
  prisma.notification.findMany({ where: { receiverId, issueId } });

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  wsSlug = ws.slug;
  await seedWorkflowRoles(prisma, ws.id);
  projetoId = (await createProject(ws.id, dono.id, { name: "SIART", identifier: "SIART" })).id;
  base = `/workspaces/${ws.slug}/projects/${projetoId}`;
  qualidade = await createPessoa("qualidade");
  atendente = await createPessoa("atendimento");
  await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
    name: "Prefeitura de Teste",
    email: "cliente@prefeitura.test",
    password: SENHA,
    project_ids: [projetoId],
  });
  const entrada = await portal().post("/entrar", { workspace: wsSlug, email: "cliente@prefeitura.test", senha: SENHA });
  tokenDoCliente = ((await entrada.json()) as { token: string }).token;
}, 60_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("No atendimento", () => {
  it("o pedido do portal nasce com o Atendimento: a Qualidade não é avisada", async () => {
    const id = await abrirPeloPortal("Guia não emite");
    expect(await readStatus(id)).toBe(NO_ATENDIMENTO);
    expect((await avisosDe(atendente.user.id, id)).map((n) => n.title)).toEqual(["Nova solicitação no atendimento"]);
    expect(await avisosDe(qualidade.user.id, id)).toHaveLength(0);
  });

  it("fica fora dos Pendentes da triagem e aparece na aba No atendimento", async () => {
    const id = await abrirPeloPortal("Fila do atendimento");
    const ids = async (status: string) => {
      const corpo = (await (
        await admin.get(`/workspaces/${wsSlug}/global-intake-issues/?status=${status}`)
      ).json()) as {
        results: { issue?: { id: string } }[];
      };
      return corpo.results.map((item) => item.issue?.id);
    };
    expect(await ids(String(PENDENTE))).not.toContain(id);
    expect(await ids(String(NO_ATENDIMENTO))).toContain(id);
  });

  it("o cliente vê Em atendimento e pode responder", async () => {
    const id = await abrirPeloPortal("Cliente acompanha");
    const res = await portal(tokenDoCliente).get(`/solicitacoes/${id}`);
    const corpo = (await res.json()) as any;
    expect(corpo.situacao).toBe("Em atendimento");
    expect(corpo.acoes.responder).toBe(true);
  });

  it("encaminhar leva para a triagem e avisa a Qualidade", async () => {
    const id = await abrirPeloPortal("Encaminhar");
    expect((await atendente.api.post(`${base}/inbox-issues/${id}/encaminhar/`, {})).status).toBe(200);
    expect(await readStatus(id)).toBe(PENDENTE);
    expect((await avisosDe(qualidade.user.id, id)).map((n) => n.title)).toEqual(["Nova solicitação"]);
    // Já encaminhada: não há o que encaminhar de novo.
    expect((await atendente.api.post(`${base}/inbox-issues/${id}/encaminhar/`, {})).status).toBe(400);
  });

  it("encerrar no atendimento exige a resposta, no campo", async () => {
    const id = await abrirPeloPortal("Encerrar sem resposta");
    const res = await atendente.api.post(`${base}/inbox-issues/${id}/encerrar-no-atendimento/`, {
      resposta_html: "<p>curta</p>",
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors.map((e: any) => e.path)).toEqual(["resposta_html"]);
    expect(await readStatus(id)).toBe(NO_ATENDIMENTO);
  });

  it("encerrar no atendimento fecha a solicitação e a resposta chega ao cliente", async () => {
    const id = await abrirPeloPortal("Resolvido por telefone");
    const res = await atendente.api.post(`${base}/inbox-issues/${id}/encerrar-no-atendimento/`, {
      resposta_html: "<p>Orientamos a emitir a guia pelo menu <strong>Tributos</strong>.</p>",
    });
    expect(res.status).toBe(200);
    expect(await readStatus(id)).toBe(ATENDIDA);
    const corpo = (await (await portal(tokenDoCliente).get(`/solicitacoes/${id}`)).json()) as any;
    expect(corpo.situacao).toBe("Resolvida no atendimento");
    expect(corpo.resposta.texto).toBe("Orientamos a emitir a guia pelo menu Tributos .");
    // Não vira chamado: continua fora do quadro, na etapa de triagem.
    const chamado = await prisma.issue.findUniqueOrThrow({ where: { id }, include: { state: true } });
    expect(chamado.state?.group).toBe("triage");
  });

  it("quem não abre nem tria solicitação não decide", async () => {
    const id = await abrirPeloPortal("Sem permissão");
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendente.user.id },
      data: { revokedActions: ["intake.create"] },
    });
    expect((await atendente.api.post(`${base}/inbox-issues/${id}/encaminhar/`, {})).status).toBe(403);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendente.user.id },
      data: { revokedActions: [] },
    });
  });
});
