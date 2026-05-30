/**
 * Contract tests for page/wiki endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, apiClient } from "@tests/helpers/factory";

describe("TestPageListCreateAPIEndpoint", () => {
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

  const url = () => `/workspaces/${wsSlug}/pages/`;

  it("create page returns 201", async () => {
    const res = await client.post(url(), { name: "Test Wiki Page" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Test Wiki Page");
    expect(data.id).toBeDefined();
  });

  it("list pages returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("create page without name returns 400", async () => {
    const res = await client.post(url(), { description_html: "<p>no name</p>" });
    expect(res.status).toBe(400);
  });

  it("get page detail", async () => {
    const createRes = await client.post(url(), { name: "Detail Page" });
    const created = await createRes.json() as any;
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
    expect(data.name).toBe("Detail Page");
  });

  it("update page content", async () => {
    const createRes = await client.post(url(), { name: "Updatable Page" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, {
      name: "Updated Title",
      description_html: "<p>Updated content</p>",
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Updated Title");
  });

  it("lock and unlock page", async () => {
    const createRes = await client.post(url(), { name: "Lockable" });
    const created = await createRes.json() as any;

    const lockRes = await client.post(`${url()}${created.id}/lock/`, {});
    expect(lockRes.status).toBe(200);
    const locked = await lockRes.json() as any;
    expect(locked.is_locked).toBe(true);

    const unlockRes = await client.delete(`${url()}${created.id}/lock/`);
    expect(unlockRes.status).toBe(200);
  });

  it("archive and unarchive page", async () => {
    const createRes = await client.post(url(), { name: "Archivable" });
    const created = await createRes.json() as any;

    const archiveRes = await client.post(`${url()}${created.id}/archive/`, {});
    expect(archiveRes.status).toBe(200);

    const unarchiveRes = await client.delete(`${url()}${created.id}/archive/`);
    expect(unarchiveRes.status).toBe(200);
  });

  it("delete page returns 204", async () => {
    const createRes = await client.post(url(), { name: "Deletable Page" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
