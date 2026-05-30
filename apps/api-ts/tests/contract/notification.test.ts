import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, apiClient } from "@tests/helpers/factory";
import prisma from "@db";

describe("TestNotificationAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let userId: string;
  let notificationId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    client = apiClient(token.token);

    // Create seed notifications directly
    const notif = await prisma.notification.create({
      data: {
        workspaceId: ws.id,
        projectId: null,
        issueId: null,
        receiverId: user.id,
        actorId: user.id,
        title: "Issue assigned to you",
        message: "You have been assigned to Issue #1",
        data: {},
        entity: "issue",
        entityId: "00000000-0000-0000-0000-000000000001",
        isRead: false,
        isArchived: false,
      },
    });
    notificationId = notif.id;

    // Create a second unread notification
    await prisma.notification.create({
      data: {
        workspaceId: ws.id,
        projectId: null,
        issueId: null,
        receiverId: user.id,
        actorId: user.id,
        title: "Comment on your issue",
        message: "Someone commented",
        data: {},
        entity: "issue",
        entityId: "00000000-0000-0000-0000-000000000002",
        isRead: false,
        isArchived: false,
      },
    });
  });

  afterAll(() => cleanDb());

  const base = () => `/workspaces/${wsSlug}/users/notifications`;

  it("list notifications returns paginated results", async () => {
    const res = await client.get(`${base()}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThanOrEqual(2);
  });

  it("filter notifications by read=false", async () => {
    const res = await client.get(`${base()}/?read=false`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.every((n: any) => n.is_read === false || n.isRead === false)).toBe(true);
  });

  it("GET unread count", async () => {
    const res = await client.get(`${base()}/unread/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(typeof data.count).toBe("number");
    expect(data.count).toBeGreaterThanOrEqual(2);
  });

  it("mark notification as read via PATCH", async () => {
    const res = await client.patch(`${base()}/${notificationId}/`, { is_read: true });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.is_read ?? data.isRead).toBe(true);
  });

  it("mark all read decrements unread count", async () => {
    const res = await client.post(`${base()}/mark-all-read/`, {});
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(typeof data.marked).toBe("number");

    const countRes = await client.get(`${base()}/unread/`);
    const countData = await countRes.json() as any;
    expect(countData.count).toBe(0);
  });

  it("archive notification via PATCH", async () => {
    const res = await client.patch(`${base()}/${notificationId}/`, { is_archived: true });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.is_archived ?? data.isArchived).toBe(true);
  });

  it("delete (archive) notification returns 204", async () => {
    const notif = await prisma.notification.create({
      data: {
        workspaceId: wsId, projectId: null, issueId: null, receiverId: userId, actorId: userId,
        title: "To delete", message: "msg", data: {},
        entity: "issue", entityId: "00000000-0000-0000-0000-000000000099",
        isRead: false, isArchived: false,
      },
    });
    const res = await client.delete(`${base()}/${notif.id}/`);
    expect(res.status).toBe(204);
  });
});
