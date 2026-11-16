/**
 * A lista global de solicitações mostra o número, a entidade e onde o pedido
 * está (testes da nova intranet, item 9 e a dúvida "aonde está o chamado e com
 * quem"). Antes só vinham a sigla do sistema e o título.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  buildPedidoDeSolicitacao,
  createApiToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Item = {
  issue: { id: string; sequence_id: number; ticket_number: string | null; state_name: string | null } | null;
  project: { identifier: string } | null;
  entity: { id: string; name: string } | null;
  setor: string | null;
};

let admin: ReturnType<typeof apiClient>;
let wsSlug: string;
let issueId: string;
let entidadeId: string;
let wsId: string;
let base: string;

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  admin = apiClient((await createApiToken(dono.id)).token);
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  wsId = ws.id;
  await seedWorkflowRoles(prisma, ws.id);
  const sistema = await createProject(ws.id, dono.id, { identifier: "ALMOXA" });
  await createState(sistema.id, ws.id, { name: "Triagem", group: "triage", isTriage: true });
  const pedido = await buildPedidoDeSolicitacao(ws.id, { name: "13/11/2026 teste 4" });
  entidadeId = pedido.entity_id;
  base = `/workspaces/${ws.slug}/projects/${sistema.id}`;
  const res = await admin.post(`${base}/inbox-issues/`, pedido);
  issueId = ((await res.json()) as { issue: { id: string } }).issue.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("lista global de solicitações", () => {
  it("cada item traz o número anual, o do sistema, a entidade, a etapa e o setor", async () => {
    const res = await admin.get(`/workspaces/${wsSlug}/global-intake-issues/`);
    expect(res.status).toBe(200);
    const item = ((await res.json()) as { results: Item[] }).results.find((i) => i.issue?.id === issueId)!;
    expect(item.issue?.ticket_number).toMatch(/^\d+-\d{4}$/);
    expect(item.issue?.sequence_id).toBeGreaterThan(0);
    expect(item.project?.identifier).toBe("ALMOXA");
    expect(item.entity).toMatchObject({ id: entidadeId });
    expect(item.issue?.state_name).toBe("Triagem");
    expect(item.setor).toBe("Qualidade");
  });

  it("o detalhe da triagem traz a entidade", async () => {
    const res = await admin.get(`${base}/inbox-issues/${issueId}/`);
    expect(((await res.json()) as any).issue.entity).toMatchObject({ id: entidadeId });
  });

  it("a triagem corrige a entidade", async () => {
    const outra = await prisma.entity.create({ data: { workspaceId: wsId, name: "Câmara de Teste" } });
    const res = await admin.patch(`${base}/inbox-issues/${issueId}/`, { issue: { entity_id: outra.id } });
    expect(res.status).toBe(200);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: issueId } })).entityId).toBe(outra.id);
  });
});
