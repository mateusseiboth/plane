/**
 * `POST /workspaces/:slug/projects/:project_id/inbox-issues/`
 *
 * A solicitação avulsa, aberta pelo botão "Novo chamado" de quem só abre
 * solicitação (Atendimento): o mesmo modal da conversa do chat, sem a conversa.
 * Leva título, prioridade ("cliente parado" = urgente), módulo, entidade e o
 * complemento em texto rico. Entidade e descrição do problema são obrigatórias
 * (testes da nova intranet, 16/11/2026: gravava sem nada), e a resposta traz o
 * número que o atendimento passa ao cliente.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createEntity,
  createMemberWithToken,
  createModule,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let admin: ReturnType<typeof apiClient>;
let wsSlug: string;
let wsId: string;
let projetoId: string;
let moduloId: string;
let entidadeId: string;

const url = (projeto = projetoId) => `/workspaces/${wsSlug}/projects/${projeto}/inbox-issues/`;

/** O mínimo que a abertura exige: título, entidade e a descrição do problema. */
const pedido = (extra: Record<string, unknown> = {}) => ({
  name: "Pedido",
  entity_id: entidadeId,
  description_html: "<p>Cliente relata que a guia não emite.</p>",
  ...extra,
});

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  wsId = ws.id;
  projetoId = (await createProject(ws.id, dono.id)).id;
  moduloId = (await createModule(projetoId, ws.id, { name: "Tributos" })).id;
  entidadeId = (await createEntity(ws.id, { name: "Prefeitura de Teste" })).id;
});

describe("POST .../inbox-issues/ (solicitação avulsa)", () => {
  it("abre na triagem com prioridade, módulo, entidade e complemento rico", async () => {
    const res = await admin.post(url(), {
      name: "Guia não emite",
      priority: "urgent",
      module_id: moduloId,
      entity_id: entidadeId,
      description_html: "<p>Cliente usa a <strong>versão 3</strong>.</p>",
    });
    expect(res.status).toBe(201);
    const issueId = ((await res.json()) as any).issue.id;
    const chamado = await prisma.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(chamado).toMatchObject({
      name: "Guia não emite",
      priority: "urgent",
      entityId: entidadeId,
      descriptionHtml: "<p>Cliente usa a <strong>versão 3</strong>.</p>",
    });
    expect(await prisma.intakeIssue.count({ where: { issueId } })).toBe(1);
    expect(await prisma.moduleIssue.count({ where: { issueId, moduleId: moduloId } })).toBe(1);
  });

  it("módulo de outro sistema: 422 no campo module_id", async () => {
    const outroProjeto = await createProject(wsId, (await createUser()).id);
    const alheio = await createModule(outroProjeto.id, wsId);
    const res = await admin.post(url(), pedido({ module_id: alheio.id }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "module_id", message: "O módulo não pertence ao sistema escolhido." },
    ]);
  });

  it("entidade de outro espaço: 422 no campo entity_id", async () => {
    const outroEspaco = await createWorkspace((await createUser()).id);
    const alheia = await createEntity(outroEspaco.id, { name: "Entidade Alheia" });
    const res = await admin.post(url(), pedido({ entity_id: alheia.id }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "entity_id", message: "A entidade não foi encontrada neste espaço." },
    ]);
  });

  it("atendente do sistema abre a solicitação", async () => {
    const atendente = await createMemberWithToken(wsId, 6, projetoId, 6);
    const res = await apiClient(atendente.token).post(
      url(),
      pedido({ name: "Pedido do atendimento", priority: "urgent" })
    );
    expect(res.status).toBe(201);
  });

  it("atendente sem vínculo com o sistema abre mesmo assim: intake.create no espaço basta", async () => {
    const atendente = await createMemberWithToken(wsId, 6);
    const res = await apiClient(atendente.token).post(url(), pedido({ name: "Pedido de quem não participa" }));
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).issue.project_id).toBe(projetoId);
  });

  it("negada a ação intake.create por pessoa, 403", async () => {
    const atendente = await createMemberWithToken(wsId, 6);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendente.user.id },
      data: { revokedActions: ["intake.create"] },
    });
    expect((await apiClient(atendente.token).post(url(), pedido())).status).toBe(403);
  });

  it("sistema de outro espaço: 404", async () => {
    const outroDono = await createUser();
    const outroEspaco = await createWorkspace(outroDono.id);
    const alheio = await createProject(outroEspaco.id, outroDono.id);
    expect((await admin.post(url(alheio.id), pedido())).status).toBe(404);
  });

  it("sem entidade e sem descrição: 422 nos dois campos, nada gravado", async () => {
    const antes = await prisma.issue.count();
    const res = await admin.post(url(), { name: "Sem nada" });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "entity_id", message: "Informe a entidade." },
      { path: "description_html", message: "Descreva o problema do cliente." },
    ]);
    expect(await prisma.issue.count()).toBe(antes);
  });

  it("descrição só com marcação ou espaço conta como vazia", async () => {
    const vazias = ["<p></p>", "<p>   </p><p><br></p>", "&nbsp;"];
    const respostas = await Promise.all(vazias.map((vazia) => admin.post(url(), pedido({ description_html: vazia }))));
    expect(respostas.map((res) => res.status)).toEqual([422, 422, 422]);
    const corpos = (await Promise.all(respostas.map((res) => res.json()))) as { errors: { path: string }[] }[];
    for (const corpo of corpos) expect(corpo.errors.map((e) => e.path)).toEqual(["description_html"]);
  });

  it("devolve o número para o cliente (N-AAAA) e o do sistema", async () => {
    const res = await admin.post(url(), pedido());
    expect(res.status).toBe(201);
    const { issue } = (await res.json()) as any;
    const projeto = await prisma.project.findUniqueOrThrow({ where: { id: projetoId } });
    expect(issue.ticket_number).toMatch(/^\d+-\d{4}$/);
    expect(issue.label).toBe(`${projeto.identifier}-${issue.sequence_id}`);
  });
});

describe("GET /workspaces/:slug/sistemas-para-solicitacao/", () => {
  const rota = () => `/workspaces/${wsSlug}/sistemas-para-solicitacao/`;

  it("atendente sem vínculo recebe todos os sistemas do espaço, só id, nome e identificador", async () => {
    const atendente = await createMemberWithToken(wsId, 6);
    const res = await apiClient(atendente.token).get(rota());
    expect(res.status).toBe(200);
    const sistemas = (await res.json()) as any[];
    const total = await prisma.project.count({ where: { workspaceId: wsId, deletedAt: null, archivedAt: null } });
    expect(sistemas).toHaveLength(total);
    expect(Object.keys(sistemas[0]).toSorted()).toEqual(["id", "identifier", "name"]);
    expect(sistemas.map((p) => p.id)).toContain(projetoId);
  });

  it("sem intake.create, 403", async () => {
    const atendente = await createMemberWithToken(wsId, 6);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendente.user.id },
      data: { revokedActions: ["intake.create"] },
    });
    expect((await apiClient(atendente.token).get(rota())).status).toBe(403);
  });
});
