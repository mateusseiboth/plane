/**
 * Contract tests for state endpoints.
 * Mirrors: apps/api/plane/tests/contract/api/test_states.py (if it exists)
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, apiClient } from "@tests/helpers/factory";

describe("TestStateListCreateAPIEndpoint", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/projects/${projectId}/states/`;

  it("list states returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    // Default states are created with the project
    expect(data.results.length).toBeGreaterThan(0);
  });

  it("create state returns 201", async () => {
    const res = await client.post(url(), { name: "Custom State", color: "#8b5cf6", group: "started" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Custom State");
    expect(data.group).toBe("started");
  });

  it("create state with duplicate name returns 409", async () => {
    await client.post(url(), { name: "Unique State" });
    const res = await client.post(url(), { name: "Unique State" });
    expect(res.status).toBe(409);
  });

  it("create state without name returns 400", async () => {
    const res = await client.post(url(), { color: "#ff0000" });
    expect(res.status).toBe(400);
  });

  it("get state detail", async () => {
    const listRes = await client.get(url());
    const list = await listRes.json() as any;
    const stateId = list.results[0].id;
    const res = await client.get(`${url()}${stateId}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(stateId);
  });

  it("update state", async () => {
    const createRes = await client.post(url(), { name: "Rename Me" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { name: "Renamed", color: "#22c55e" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Renamed");
  });

  it("delete non-default empty state returns 204", async () => {
    const createRes = await client.post(url(), { name: "Deletable State" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
