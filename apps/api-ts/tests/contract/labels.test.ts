/**
 * Contract tests for labels endpoints.
 * Mirrors: apps/api/plane/tests/contract/api/test_labels.py
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  createUser,
  createApiToken,
  createWorkspace,
  createProject,
  apiClient,
} from "@tests/helpers/factory";

describe("TestLabelListCreateAPIEndpoint", () => {
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
    const project = await createProject(ws.id, userId);
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(async () => {
    await cleanDb();
  });

  function labelsUrl() {
    return `/workspaces/${wsSlug}/projects/${projectId}/labels/`;
  }

  it("create label should return 201", async () => {
    const res = await client.post(labelsUrl(), {
      name: "Bug",
      color: "#dc2626",
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.name).toBe("Bug");
    expect(data.color).toBe("#dc2626");
  });

  it("create label with no name should return 400", async () => {
    const res = await client.post(labelsUrl(), { color: "#ff0000" });
    expect(res.status).toBe(400);
  });

  it("list labels returns paginated results", async () => {
    const res = await client.get(labelsUrl());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("update label changes name and color", async () => {
    const createRes = await client.post(labelsUrl(), { name: "Feature" });
    const created = await createRes.json() as any;

    const res = await client.patch(`${labelsUrl()}${created.id}/`, {
      name: "Enhancement",
      color: "#22c55e",
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Enhancement");
    expect(data.color).toBe("#22c55e");
  });

  it("delete label returns 204", async () => {
    const createRes = await client.post(labelsUrl(), { name: "ToDelete" });
    const created = await createRes.json() as any;

    const res = await client.delete(`${labelsUrl()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
