import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, createIssue, apiClient } from "@tests/helpers/factory";

describe("TestAnalyticsAPIEndpoints", () => {
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
    // Seed some issues
    await createIssue(project.id, ws.id, { name: "Issue A", priority: "urgent" });
    await createIssue(project.id, ws.id, { name: "Issue B", priority: "low" });
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  it("GET default-analytics returns summary", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/default-analytics/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(typeof data.total_issues).toBe("number");
    expect(data.priorities).toBeDefined();
    expect(typeof data.priorities.urgent).toBe("number");
    expect(data.by_state).toBeInstanceOf(Array);
  });

  it("GET default-analytics filtered by project", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/default-analytics/?project_id=${projectId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total_issues).toBeGreaterThanOrEqual(2);
  });

  it("GET project-stats returns per-project totals", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/project-stats/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    const stat = data.results.find((r: any) => r.project?.id === projectId);
    expect(stat).toBeDefined();
    expect(stat.total).toBeGreaterThanOrEqual(2);
  });
});

describe("TestAnalyticViewCRUD", () => {
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

  const url = () => `/workspaces/${wsSlug}/analytic-view/`;

  it("create analytic view returns 201", async () => {
    const res = await client.post(url(), { name: "Open Issues by State", query: { state: "open" }, query_data: {} });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Open Issues by State");
    expect(data.id).toBeDefined();
  });

  it("create analytic view without name returns 400", async () => {
    const res = await client.post(url(), { query: {} });
    expect(res.status).toBe(400);
  });

  it("list analytic views returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("get analytic view by id", async () => {
    const createRes = await client.post(url(), { name: "Fetch View" });
    const created = await createRes.json() as any;
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
  });

  it("update analytic view", async () => {
    const createRes = await client.post(url(), { name: "Old View Name" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { name: "Updated View", description: "New desc" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Updated View");
  });

  it("delete analytic view returns 204", async () => {
    const createRes = await client.post(url(), { name: "Delete View" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
