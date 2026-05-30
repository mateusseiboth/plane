import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, createIssue, apiClient } from "@tests/helpers/factory";

describe("TestFileAssetAPIEndpoints", () => {
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

  const url = () => `/workspaces/${wsSlug}/assets/`;

  it("create file asset returns 201", async () => {
    const res = await client.post(url(), {
      asset: "uploads/workspace/logo.png",
      mime_type: "image/png",
      size: 48320,
      is_uploaded: true,
      entity_type: 0,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.asset ?? data.asset).toBe("uploads/workspace/logo.png");
  });

  it("create asset without path returns 400", async () => {
    const res = await client.post(url(), { mime_type: "image/jpeg" });
    expect(res.status).toBe(400);
  });

  it("list assets returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
  });

  it("list assets filtered by entity_type", async () => {
    const res = await client.get(`${url()}?entity_type=0`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.every((a: any) => (a.entity_type ?? a.entityType) === 0)).toBe(true);
  });

  it("get asset by id", async () => {
    const createRes = await client.post(url(), { asset: "uploads/doc.pdf", mime_type: "application/pdf", size: 102400 });
    const created = await createRes.json() as any;
    const res = await client.get(`${url()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
  });

  it("update asset is_uploaded flag", async () => {
    const createRes = await client.post(url(), { asset: "uploads/pending.png", is_uploaded: false });
    const created = await createRes.json() as any;
    const res = await client.patch(`${url()}${created.id}/`, { is_uploaded: true });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.is_uploaded ?? data.isUploaded).toBe(true);
  });

  it("delete asset returns 204", async () => {
    const createRes = await client.post(url(), { asset: "uploads/delete-me.png" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});

describe("TestIssueAttachmentAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let issueId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    const issue = await createIssue(project.id, ws.id, { name: "Issue with attachments" });
    issueId = issue.id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/${issueId}/attachments/`;

  it("list issue attachments returns paginated results", async () => {
    const res = await client.get(url());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
  });

  it("add issue attachment returns 201", async () => {
    const res = await client.post(url(), {
      asset: "uploads/issues/screenshot.png",
      attributes: { name: "screenshot.png", size: 204800, type: "image/png" },
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.asset).toBe("uploads/issues/screenshot.png");
  });

  it("add attachment without asset returns 400", async () => {
    const res = await client.post(url(), { attributes: {} });
    expect(res.status).toBe(400);
  });

  it("delete attachment returns 204", async () => {
    const createRes = await client.post(url(), { asset: "uploads/issues/to-delete.png" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${url()}${created.id}/`);
    expect(res.status).toBe(204);
  });
});
