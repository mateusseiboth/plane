/**
 * Contract tests for the Widget Marketplace endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, apiClient, TEST_API_BASE_URL } from "@tests/helpers/factory";
import prisma from "@db";

function makeWidgetZip(name = "Test Widget", version = "1.0.0"): Blob {
  const manifest = JSON.stringify({
    name,
    version,
    author: "Tester",
    entry: "widget.js",
    permissions: ["worker-items.read"],
    description: "Test widget",
  });
  const bundle = `export default function Widget() { return null; }`;
  const zipped = zipSync({
    "manifest.json": strToU8(manifest),
    "widget.js": strToU8(bundle),
  });
  return new Blob([zipped], { type: "application/zip" });
}

describe("WidgetModule", () => {
  let client: ReturnType<typeof apiClient>;
  let apiToken: string;
  let widgetId: string;
  const API_BASE = `${TEST_API_BASE_URL}/api/v1`;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    // Make user an instance admin so they can manage widgets
    await prisma.user.update({ where: { id: user.id }, data: { isInstanceAdmin: true } });
    const token = await createApiToken(user.id);
    apiToken = token.token;
    client = apiClient(apiToken);
  });

  afterAll(() => cleanDb());

  it("lists widgets — returns empty array initially", async () => {
    const res = await client.get("/widgets/");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
  });

  // Upload feito por admin/TI já entra ativo (não há fila de aprovação).
  it("upload widget returns 201 with ACTIVE status", async () => {
    const form = new FormData();
    form.append("file", makeWidgetZip(), "widget.zip");
    const res = await fetch(`${API_BASE}/widgets/`, {
      method: "POST",
      headers: { "X-Api-Key": apiToken },
      body: form,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Test Widget");
    expect(data.version).toBe("1.0.0");
    expect(data.status).toBe("ACTIVE");
    expect(data.permissions).toContain("worker-items.read");
    widgetId = data.id;
  });

  it("get widget by ID returns correct data", async () => {
    const res = await client.get(`/widgets/${widgetId}`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(widgetId);
    expect(data.name).toBe("Test Widget");
  });

  it("activate widget changes status to ACTIVE", async () => {
    const res = await client.post(`/widgets/${widgetId}/activate`, {});
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("ACTIVE");
  });

  it("assets endpoint returns 200 for active widget", async () => {
    const res = await client.get(`/widgets/${widgetId}/assets/widget.js`);
    expect(res.status).toBe(200);
    const ct = res.headers.get("content-type") ?? "";
    expect(ct).toContain("javascript");
  });

  it("deactivate widget changes status to INACTIVE", async () => {
    const res = await client.post(`/widgets/${widgetId}/deactivate`, {});
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("INACTIVE");
  });

  it("assets endpoint returns 403 for inactive widget", async () => {
    const res = await client.get(`/widgets/${widgetId}/assets/widget.js`);
    expect(res.status).toBe(403);
  });

  it("upload duplicate version returns 409", async () => {
    const form = new FormData();
    form.append("file", makeWidgetZip(), "widget.zip");
    const res = await fetch(`${API_BASE}/widgets/`, {
      method: "POST",
      headers: { "X-Api-Key": apiToken },
      body: form,
    });
    expect(res.status).toBe(409);
  });

  it("delete widget soft-deletes and returns 204", async () => {
    const res = await client.delete(`/widgets/${widgetId}`);
    expect(res.status).toBe(204);
  });

  it("get deleted widget returns 404", async () => {
    const res = await client.get(`/widgets/${widgetId}`);
    expect(res.status).toBe(404);
  });

  it("upload with non-admin user returns 403", async () => {
    const regularUser = await createUser();
    const token = await createApiToken(regularUser.id);
    const form = new FormData();
    form.append("file", makeWidgetZip("Another", "1.0.0"), "widget.zip");
    const res = await fetch(`${API_BASE}/widgets/`, {
      method: "POST",
      headers: { "X-Api-Key": token.token },
      body: form,
    });
    expect(res.status).toBe(403);
  });
});
