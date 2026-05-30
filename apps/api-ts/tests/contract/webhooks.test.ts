import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, apiClient } from "@tests/helpers/factory";

describe("TestWebhookAPIEndpoints", () => {
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

  const url = () => `/workspaces/${wsSlug}/webhooks/`;

  it("create webhook returns 201", async () => {
    const res = await client.post(url(), { url: "https://example.com/webhook", events: ["issue", "comment"] });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.url).toBe("https://example.com/webhook");
    expect(data.secret).toBeDefined();
  });

  it("list webhooks", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
  });

  it("webhook requires url", async () => {
    const res = await client.post(url(), { events: ["issue"] });
    expect(res.status).toBe(400);
  });

  it("update webhook", async () => {
    const createRes = await client.post(url(), { url: "https://example.com/hook1", events: [] });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { events: ["issue", "cycle"] });
    expect(res.status).toBe(200);
  });

  it("regenerate webhook secret", async () => {
    const createRes = await client.post(url(), { url: "https://example.com/hook2" });
    const created = await createRes.json() as any;
    const oldSecret = created.secret;
    const res = await client.post(`${url()}${created.id}/regenerate/`, {});
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.secret).not.toBe(oldSecret);
  });

  it("delete webhook returns 204", async () => {
    const createRes = await client.post(url(), { url: "https://example.com/hook3" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
