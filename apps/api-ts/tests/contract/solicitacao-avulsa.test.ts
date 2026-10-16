/**
 * `POST /workspaces/:slug/projects/:project_id/inbox-issues/`
 *
 * A solicitação avulsa, aberta pelo botão "Novo chamado" de quem só abre
 * solicitação (Atendimento): o mesmo modal da conversa do chat, sem a conversa.
 * Leva título, prioridade ("cliente parado" = urgente), módulo, entidade e o
 * complemento em texto rico.
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
    const res = await admin.post(url(), { name: "X", module_id: alheio.id });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "module_id", message: "O módulo não pertence ao sistema escolhido." },
    ]);
  });

  it("entidade de outro espaço: 422 no campo entity_id", async () => {
    const outroEspaco = await createWorkspace((await createUser()).id);
    const alheia = await createEntity(outroEspaco.id, { name: "Entidade Alheia" });
    const res = await admin.post(url(), { name: "X", entity_id: alheia.id });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "entity_id", message: "A entidade não foi encontrada neste espaço." },
    ]);
  });

  it("atendente do sistema abre a solicitação", async () => {
    const atendente = await createMemberWithToken(wsId, 6, projetoId, 6);
    const res = await apiClient(atendente.token).post(url(), { name: "Pedido do atendimento", priority: "urgent" });
    expect(res.status).toBe(201);
  });

  it("atendente sem vínculo com o sistema abre mesmo assim: intake.create no espaço basta", async () => {
    const atendente = await createMemberWithToken(wsId, 6);
    const res = await apiClient(atendente.token).post(url(), { name: "Pedido de quem não participa" });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).issue.project_id).toBe(projetoId);
  });

  it("negada a ação intake.create por pessoa, 403", async () => {
    const atendente = await createMemberWithToken(wsId, 6);
    await prisma.workspaceMember.updateMany({
      where: { workspaceId: wsId, memberId: atendente.user.id },
      data: { revokedActions: ["intake.create"] },
    });
    expect((await apiClient(atendente.token).post(url(), { name: "X" })).status).toBe(403);
  });

  it("sistema de outro espaço: 404", async () => {
    const outroDono = await createUser();
    const outroEspaco = await createWorkspace(outroDono.id);
    const alheio = await createProject(outroEspaco.id, outroDono.id);
    expect((await admin.post(url(alheio.id), { name: "X" })).status).toBe(404);
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
