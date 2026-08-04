import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, apiClient } from "@tests/helpers/factory";

describe("TestWorkspaceInviteAPIEndpoints", () => {
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

  const url = () => `/workspaces/${wsSlug}/invitations/`;

  it("send invitation returns 201 with invite list", async () => {
    const res = await client.post(url(), {
      emails: ["invited-user@company.com", "another@company.com"],
      role: 10,
      message: "Welcome to our workspace!",
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.count).toBe(2);
    expect(data.invitations).toBeInstanceOf(Array);
    expect(data.invitations[0].token).toBeDefined();
  });

  it("send invitation without emails returns 400", async () => {
    const res = await client.post(url(), { role: 5 });
    expect(res.status).toBe(400);
  });

  it("list invitations returns an array", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it("filter invitations by accepted=false", async () => {
    const res = await client.get(`${url()}?accepted=false`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.every((i: any) => i.accepted === false)).toBe(true);
  });

  it("get invitation by id", async () => {
    const createRes = await client.post(url(), { emails: ["fetch@test.com"] });
    const created = await createRes.json() as any;
    const inviteId = created.invitations[0].id;
    const res = await client.get(`${url()}${inviteId}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(inviteId);
    expect(data.email).toBe("fetch@test.com");
  });

  it("update invitation role", async () => {
    const createRes = await client.post(url(), { emails: ["update-role@test.com"], role: 5 });
    const created = await createRes.json() as any;
    const inviteId = created.invitations[0].id;
    const res = await client.patch(`${url()}${inviteId}/`, { role: 15 });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.role).toBe(15);
  });

  it("delete invitation returns 204", async () => {
    const createRes = await client.post(url(), { emails: ["delete-invite@test.com"] });
    const created = await createRes.json() as any;
    const inviteId = created.invitations[0].id;
    const res = await client.delete(`${url()}${inviteId}/`);
    expect(res.status).toBe(204);
  });

  it("accept invitation via token", async () => {
    // Create user first, then invite
    const newUser = await createUser({ email: "accept-me@test.com" });
    const createRes = await client.post(url(), { emails: ["accept-me@test.com"], role: 10 });
    const created = await createRes.json() as any;
    const token = created.invitations[0].token;

    const res = await client.post(`${url()}accept/`, { token });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.accepted).toBe(true);
    expect(data.email).toBe("accept-me@test.com");
  });

  it("accept with invalid token returns 404", async () => {
    const res = await client.post(`${url()}accept/`, { token: "non-existent-token" });
    expect(res.status).toBe(404);
  });
});

describe("TestProjectInviteAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let wsId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/projects/${projectId}/invitations/`;

  it("send project invitation returns 201", async () => {
    const res = await client.post(url(), { emails: ["proj-invite@test.com"], role: 5 });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.count).toBe(1);
    expect(data.invitations[0].project_id ?? data.invitations[0].projectId).toBe(projectId);
  });

  it("list project invitations", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // Convites de projeto são paginados (diferente dos de workspace, que vêm em array).
    expect(data.results).toBeInstanceOf(Array);
  });

  it("delete project invitation returns 204", async () => {
    const createRes = await client.post(url(), { emails: ["del-proj-invite@test.com"] });
    const created = await createRes.json() as any;
    const inviteId = created.invitations[0].id;
    const res = await client.delete(`${url()}${inviteId}/`);
    expect(res.status).toBe(204);
  });
});
