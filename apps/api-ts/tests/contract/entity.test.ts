/**
 * Contract tests for Entity + TechnicalVisit endpoints (SAC custom).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, apiClient } from "@tests/helpers/factory";

describe("TestEntityAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/entities/`;

  it("create entity returns 201", async () => {
    const res = await client.post(url(), { name: "Prefeitura de Sidrolândia", entity_type: 0, city: "Sidrolândia", state: "MS" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Prefeitura de Sidrolândia");
    expect(data.entity_type).toBe(0);
  });

  it("list entities returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("create entity without name returns 400", async () => {
    const res = await client.post(url(), { entity_type: 1 });
    expect(res.status).toBe(400);
  });

  it("duplicate entity name returns 409", async () => {
    await client.post(url(), { name: "Câmara Dupla" });
    const res = await client.post(url(), { name: "Câmara Dupla" });
    expect(res.status).toBe(409);
  });

  it("update entity", async () => {
    const createRes = await client.post(url(), { name: "Old Entity" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { name: "Updated Entity", is_active: false });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Updated Entity");
    expect(data.is_active).toBe(false);
  });

  it("filter entities by is_active", async () => {
    await client.post(url(), { name: "Active Entity" });
    const res = await client.get(`${url()}?is_active=true`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.every((e: any) => e.is_active === true)).toBe(true);
  });

  it("delete entity returns 204", async () => {
    const createRes = await client.post(url(), { name: "Delete Entity" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});

describe("TestTechnicalVisitAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let entityId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);
    const entityRes = await client.post(`/workspaces/${wsSlug}/entities/`, { name: "Test Entity" });
    const entity = await entityRes.json() as any;
    entityId = entity.id;
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/technical-visits/`;

  it("create technical visit returns 201", async () => {
    const res = await client.post(url(), {
      entity: entityId,
      scheduled_date: "2026-06-15",
      city: "Campo Grande",
      mot_training: true,
      status: 0,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.entity_id ?? data.entityId).toBe(entityId);
    expect(data.mot_training ?? data.motTraining).toBe(true);
  });

  it("list visits returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("get visit report", async () => {
    const res = await client.get(`${url()}report/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.total).toBe("number");
    expect(data.motivations).toBeDefined();
  });

  it("update visit status to completed", async () => {
    const createRes = await client.post(url(), { scheduled_date: "2026-06-20", status: 0 });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { status: 1, started_at: "2026-06-20T09:00:00Z", finished_at: "2026-06-20T17:00:00Z" });
    expect(res.status).toBe(200);
  });

  it("delete visit returns 204", async () => {
    const createRes = await client.post(url(), { scheduled_date: "2026-07-01" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
