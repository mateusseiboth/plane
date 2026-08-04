/**
 * Contract tests for /api/v1/workspaces/{slug}/projects/
 * Mirrors: apps/api/plane/tests/contract/api/test_projects.py
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  createUser,
  createApiToken,
  createWorkspace,
  createProject,
  apiClient,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";

describe("TestProjectListCreateAPIEndpoint", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(userId);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    client = apiClient(token.token);
  });

  afterAll(async () => {
    await cleanDb();
  });

  function projectsUrl() {
    return `/workspaces/${wsSlug}/projects/`;
  }

  it("create project with lead as creator should return 201", async () => {
    const res = await client.post(projectsUrl(), {
      name: "Self Lead Project",
      identifier: "SLP",
      project_lead: userId,
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.name).toBe("Self Lead Project");
    expect(data.identifier).toBe("SLP");
  });

  it("create project with missing name should return 400", async () => {
    const res = await client.post(projectsUrl(), { identifier: "NONAME" });
    expect(res.status).toBe(400);
  });

  it("create project with missing identifier should return 400", async () => {
    const res = await client.post(projectsUrl(), { name: "No Identifier" });
    expect(res.status).toBe(400);
  });

  it("create project with duplicate identifier should return 409", async () => {
    // First create
    await client.post(projectsUrl(), { name: "First Project", identifier: "DUP1" });
    // Second with same identifier
    const res = await client.post(projectsUrl(), { name: "Second Project", identifier: "DUP1" });
    expect(res.status).toBe(409);
  });

  // A listagem de projetos devolve um array puro — é o formato que o frontend
  // consome (`response.data`), não o envelope paginado.
  it("list projects should return an array", async () => {
    const res = await client.get(projectsUrl());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].id).toBeDefined();
  });

  it("unauthenticated request should return 401", async () => {
    const res = await fetch(`${TEST_API_BASE_URL}/api/v1/workspaces/${wsSlug}/projects/`, {
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(401);
  });
});
