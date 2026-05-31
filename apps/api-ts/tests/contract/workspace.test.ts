/**
 * Contract tests for workspace management endpoints.
 */
import {apiClient, createApiToken, createUser, createWorkspace} from "@tests/helpers/factory";
import {cleanDb} from "@tests/helpers/setup";
import {afterAll, beforeAll, describe, expect, it} from "bun:test";

describe("TestWorkspaceAPIEndpoints", () => {
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

  it("list workspaces returns user's workspaces", async () => {
    const res = await client.get("/workspaces/");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThan(0);
  });

  it("get workspace detail", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.slug).toBe(wsSlug);
  });

  it("quick links CRUD", async () => {
    const createRes = await client.post(`/workspaces/${wsSlug}/quick-links/`, {
      title: "Docs",
      url: "example.com/docs",
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;
    expect(created.title).toBe("Docs");
    expect(created.url).toBe("http://example.com/docs");

    const listRes = await client.get(`/workspaces/${wsSlug}/quick-links/`);
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData).toEqual(expect.arrayContaining([expect.objectContaining({id: created.id})]));

    const updateRes = await client.patch(`/workspaces/${wsSlug}/quick-links/${created.id}/`, {
      title: "Updated Docs",
      url: "https://example.com/docs",
    });
    expect(updateRes.status).toBe(200);
    const updated = (await updateRes.json()) as any;
    expect(updated.title).toBe("Updated Docs");
    expect(updated.url).toBe("https://example.com/docs");

    const deleteRes = await client.delete(`/workspaces/${wsSlug}/quick-links/${created.id}/`);
    expect(deleteRes.status).toBe(204);
  });

  it("create workspace returns 201", async () => {
    const slug = `test-ws-${Date.now()}`;
    const res = await client.post("/workspaces/", {name: "New Workspace", slug});
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.slug).toBe(slug);
  });

  it("create workspace with duplicate slug returns 409", async () => {
    const res = await client.post("/workspaces/", {name: "Duplicate", slug: wsSlug});
    expect(res.status).toBe(409);
  });

  it("create workspace without name returns 400", async () => {
    const res = await client.post("/workspaces/", {slug: "no-name-ws"});
    expect(res.status).toBe(400);
  });

  it("update workspace name", async () => {
    const res = await client.patch(`/workspaces/${wsSlug}/`, {name: "Updated Workspace Name"});
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.name).toBe("Updated Workspace Name");
  });

  it("search returns results", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/search/?query=test`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.results).toBeDefined();
  });

  it("stickies CRUD", async () => {
    const createRes = await client.post(`/workspaces/${wsSlug}/stickies/`, {title: "My note", color: "#ff0000"});
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as any;

    const listRes = await client.get(`/workspaces/${wsSlug}/stickies/`);
    expect(listRes.status).toBe(200);

    const deleteRes = await client.delete(`/workspaces/${wsSlug}/stickies/${created.id}/`);
    expect(deleteRes.status).toBe(204);
  });
});
