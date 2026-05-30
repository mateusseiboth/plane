import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, apiClient } from "@tests/helpers/factory";
import prisma from "@db";

describe("TestWorkspaceMemberAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let secondUserId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;

    // Add a second user as workspace member
    const secondUser = await createUser({ email: "second@plane.test", displayName: "Second User" });
    secondUserId = secondUser.id;
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, memberId: secondUser.id, role: 5, isActive: true },
    });

    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  it("list workspace members returns paginated results", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/members/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThanOrEqual(2);
    expect(typeof data.total_count).toBe("number");
  });

  it("get /members/me/ returns authenticated user membership", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/members/me/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.role).toBe(20);
    expect(data.member).toBeDefined();
  });

  it("member listing includes member details", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/members/`);
    const data = await res.json() as any;
    const second = data.results.find((m: any) => m.memberId === secondUserId || m.member_id === secondUserId || m.member?.id === secondUserId);
    expect(second).toBeDefined();
    expect(second.member?.email ?? second.email).toBeDefined();
  });
});

describe("TestProjectMemberAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let wsId: string;
  let secondUserId: string;
  let secondMemberId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;

    // Add a second workspace member
    const secondUser = await createUser({ email: "proj-second@plane.test" });
    secondUserId = secondUser.id;
    await prisma.workspaceMember.create({
      data: { workspaceId: ws.id, memberId: secondUser.id, role: 5, isActive: true },
    });

    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/projects/${projectId}/members/`;

  it("list project members returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThanOrEqual(1);
  });

  it("add project member returns 201", async () => {
    const res = await client.post(url(), { member_id: secondUserId, role: 10 });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    secondMemberId = data.id;
    expect(data.memberId ?? data.member_id).toBe(secondUserId);
    expect(data.role).toBe(10);
  });

  it("update project member role", async () => {
    const res = await client.patch(`${url()}${secondMemberId}/`, { role: 15 });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.role).toBe(15);
  });

  it("remove project member returns 204", async () => {
    const res = await client.delete(`${url()}${secondMemberId}/`);
    expect(res.status).toBe(204);
  });

  it("non-admin cannot add members (403)", async () => {
    // Create a second user and token (role=5 = viewer)
    const viewer = await createUser({ email: "viewer@plane.test" });
    await prisma.workspaceMember.create({ data: { workspaceId: wsId, memberId: viewer.id, role: 5, isActive: true } });
    await prisma.projectMember.create({ data: { projectId, workspaceId: wsId, memberId: viewer.id, role: 5, isActive: true } });
    const viewerToken = await createApiToken(viewer.id);
    const viewerClient = apiClient(viewerToken.token);

    const thirdUser = await createUser({ email: "third@plane.test" });
    const res = await viewerClient.post(url(), { member_id: thirdUser.id, role: 5 });
    expect(res.status).toBe(403);
  });
});
