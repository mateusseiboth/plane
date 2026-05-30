/**
 * Contract tests for cycles endpoints.
 * Mirrors: apps/api/plane/tests/contract/api/test_cycles.py
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  createUser,
  createApiToken,
  createWorkspace,
  createProject,
  createCycle,
  apiClient,
} from "@tests/helpers/factory";

describe("TestCycleListCreateAPIEndpoint", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(userId);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, userId, { cycleView: true });
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(async () => {
    await cleanDb();
  });

  function cyclesUrl() {
    return `/workspaces/${wsSlug}/projects/${projectId}/cycles/`;
  }

  it("create cycle success should return 201", async () => {
    const res = await client.post(cyclesUrl(), {
      name: "Test Cycle",
      description: "A test cycle for unit tests",
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.name).toBe("Test Cycle");
    expect(data.description).toBe("A test cycle for unit tests");
  });

  it("create cycle with empty data should return 400", async () => {
    const res = await client.post(cyclesUrl(), {});
    expect(res.status).toBe(400);
  });

  it("create cycle with missing name should return 400", async () => {
    const res = await client.post(cyclesUrl(), { description: "Test cycle" });
    expect(res.status).toBe(400);
  });

  it("list cycles should return paginated results", async () => {
    const res = await client.get(cyclesUrl());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("get cycle detail should return cycle", async () => {
    const createRes = await client.post(cyclesUrl(), { name: "Detail Cycle" });
    const created = await createRes.json() as any;

    const res = await client.get(`${cyclesUrl()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Detail Cycle");
  });

  it("update cycle should return updated data", async () => {
    const createRes = await client.post(cyclesUrl(), { name: "Old Name" });
    const created = await createRes.json() as any;

    const res = await client.patch(`${cyclesUrl()}${created.id}/`, { name: "New Name" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("New Name");
  });

  it("delete cycle should return 204", async () => {
    const createRes = await client.post(cyclesUrl(), { name: "To Delete" });
    const created = await createRes.json() as any;

    const res = await client.delete(`${cyclesUrl()}${created.id}/`);
    expect(res.status).toBe(204);

    // Verify it is gone
    const getRes = await client.get(`${cyclesUrl()}${created.id}/`);
    expect(getRes.status).toBe(404);
  });
});
