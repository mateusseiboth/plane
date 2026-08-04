/**
 * Contract tests for premium features:
 * AI providers, time tracking, estimates, intake, views, bulk operations
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, createIssue, apiClient } from "@tests/helpers/factory";

describe("TestAiProviderAPIEndpoints", () => {
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

  const url = () => `/workspaces/${wsSlug}/ai-providers/`;

  it("create AI provider returns 201", async () => {
    const res = await client.post(url(), { name: "Local Ollama", provider_type: "ollama", base_url: "http://localhost:11434", default_model: "llama3", is_default: true });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Local Ollama");
    // A chave nunca é devolvida — a API expõe apenas se existe uma configurada.
    expect(data.api_key).toBeUndefined();
    expect(data.has_api_key).toBe(false);
  });

  it("create provider never echoes the api_key back", async () => {
    const res = await client.post(url(), { name: "OpenAI", provider_type: "openai", api_key: "sk-test-key", default_model: "gpt-4o-mini" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.api_key).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("sk-test-key");
    expect(data.has_api_key).toBe(true);
  });

  it("list providers", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
  });

  it("provider requires name and provider_type", async () => {
    const res = await client.post(url(), { base_url: "http://localhost" });
    expect(res.status).toBe(400);
  });

  it("delete provider returns 204", async () => {
    const createRes = await client.post(url(), { name: "Delete Me AI", provider_type: "custom" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});

describe("TestEstimateAPIEndpoints", () => {
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

  const url = () => `/workspaces/${wsSlug}/projects/${projectId}/estimates/`;

  it("create estimate with points", async () => {
    const res = await client.post(url(), {
      name: "Fibonacci",
      type: "points",
      points: [
        { key: 0, value: "1" }, { key: 1, value: "2" }, { key: 2, value: "3" },
        { key: 3, value: "5" }, { key: 4, value: "8" },
      ],
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Fibonacci");
    expect(data.points.length).toBe(5);
  });

  it("list estimates", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
  });

  it("estimate requires name", async () => {
    const res = await client.post(url(), { type: "points" });
    expect(res.status).toBe(400);
  });
});

describe("TestBulkOperationsEndpoints", () => {
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

  it("bulk update issues changes priority", async () => {
    const issuesUrl = `/workspaces/${wsSlug}/projects/${projectId}/issues/`;
    const res1 = await client.post(issuesUrl, { name: "Bulk Issue 1" });
    const res2 = await client.post(issuesUrl, { name: "Bulk Issue 2" });
    const issue1 = await res1.json() as any;
    const issue2 = await res2.json() as any;

    const bulkRes = await client.post(`${issuesUrl}bulk-update/`, { issue_ids: [issue1.id, issue2.id], priority: "high" });
    expect(bulkRes.status).toBe(200);
    const bulkData = await bulkRes.json() as any;
    expect(bulkData.updated).toBe(2);
  });

  it("bulk delete issues", async () => {
    const issuesUrl = `/workspaces/${wsSlug}/projects/${projectId}/issues/`;
    const r1 = await client.post(issuesUrl, { name: "Delete 1" });
    const r2 = await client.post(issuesUrl, { name: "Delete 2" });
    const i1 = await r1.json() as any;
    const i2 = await r2.json() as any;

    const deleteRes = await client.post(`${issuesUrl}bulk-delete/`, { issue_ids: [i1.id, i2.id] });
    expect(deleteRes.status).toBe(200);
    const data = await deleteRes.json() as any;
    expect(data.deleted).toBe(2);
  });
});

describe("TestIssueViewAPIEndpoints", () => {
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

  it("create global view", async () => {
    const res = await client.post(`/workspaces/${wsSlug}/views/`, { name: "High Priority Issues", filters: { priority: ["high", "urgent"] } });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("High Priority Issues");
    expect(data.is_global).toBe(true);
  });

  it("create project view", async () => {
    const res = await client.post(`/workspaces/${wsSlug}/projects/${projectId}/views/`, { name: "Open Bugs", filters: { priority: ["urgent"] } });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Open Bugs");
    expect(data.project_id).toBe(projectId);
  });

  it("list global views", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/views/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
  });
});
