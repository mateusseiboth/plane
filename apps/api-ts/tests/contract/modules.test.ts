/**
 * Contract tests for module endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, apiClient } from "@tests/helpers/factory";

describe("TestModuleListCreateAPIEndpoint", () => {
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

  const url = () => `/workspaces/${wsSlug}/projects/${projectId}/modules/`;

  it("create module returns 201", async () => {
    const res = await client.post(url(), { name: "Sprint 1", status: "in_progress" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Sprint 1");
  });

  it("list modules returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("create module without name returns 400", async () => {
    const res = await client.post(url(), { description: "no name" });
    expect(res.status).toBe(400);
  });

  it("get module detail", async () => {
    const createRes = await client.post(url(), { name: "Detail Module" });
    const created = await createRes.json() as any;
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
  });

  it("update module", async () => {
    const createRes = await client.post(url(), { name: "Old Module" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { name: "New Module" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("New Module");
  });

  it("delete module returns 204", async () => {
    const createRes = await client.post(url(), { name: "To Delete" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
    const getRes = await client.get(`${url()}${created.id}/`);
    expect(getRes.status).toBe(404);
  });
});
