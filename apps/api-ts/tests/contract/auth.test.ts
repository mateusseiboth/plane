import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, apiClient } from "@tests/helpers/factory";

describe("TestApiTokenEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(user.id);
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => "/users/api-tokens/";

  it("create API token returns 201", async () => {
    const res = await client.post(url(), { label: "CI Token", description: "Used in CI pipeline" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.label).toBe("CI Token");
    expect(data.id).toBeDefined();
    expect(data.token).toBeDefined();
  });

  it("list API tokens returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("get token by id", async () => {
    const createRes = await client.post(url(), { label: "Fetch Token" });
    const created = await createRes.json() as any;
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
    expect(data.label).toBe("Fetch Token");
  });

  it("update token label and active status", async () => {
    const createRes = await client.post(url(), { label: "Old Label" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { label: "New Label", is_active: false });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.label).toBe("New Label");
    expect(data.is_active ?? data.isActive).toBe(false);
  });

  it("delete token returns 204", async () => {
    const createRes = await client.post(url(), { label: "Delete Me" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });

  it("get deleted token returns 404", async () => {
    const createRes = await client.post(url(), { label: "Gone Token" });
    const created = await createRes.json() as any;
    await client.delete(`${url()}${created.id}/`);
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(404);
  });

  it("create token with expiry date", async () => {
    const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await client.post(url(), { label: "Expiring Token", expired_at: expiry });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.expired_at ?? data.expiredAt).toBeDefined();
  });
});
