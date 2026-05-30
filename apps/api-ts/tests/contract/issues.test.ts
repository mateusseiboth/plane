/**
 * Contract tests for issue endpoints (CRUD, comments, links, relations).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, createIssue, apiClient } from "@tests/helpers/factory";

describe("TestIssueAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const issuesUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;

  it("create issue returns 201", async () => {
    const res = await client.post(issuesUrl(), { name: "Fix login bug", priority: "urgent" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("Fix login bug");
    expect(data.priority).toBe("urgent");
    expect(data.id).toBeDefined();
  });

  it("create issue without name returns 400", async () => {
    const res = await client.post(issuesUrl(), { priority: "low" });
    expect(res.status).toBe(400);
  });

  it("list issues returns paginated results", async () => {
    const res = await client.get(issuesUrl());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(typeof data.total_count).toBe("number");
    expect(data.next_cursor).toBeDefined();
  });

  it("list issues filtered by priority", async () => {
    await client.post(issuesUrl(), { name: "High priority issue", priority: "high" });
    const res = await client.get(`${issuesUrl()}?priority=high`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.every((i: any) => i.priority === "high")).toBe(true);
  });

  it("get issue detail with assignees and labels", async () => {
    const createRes = await client.post(issuesUrl(), { name: "Detailed Issue", assignees: [userId] });
    const created = await createRes.json() as any;
    const res = await client.get(`${issuesUrl()}${created.id}/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(created.id);
    expect(data.assignees).toBeInstanceOf(Array);
  });

  it("update issue", async () => {
    const createRes = await client.post(issuesUrl(), { name: "Original Name" });
    const created = await createRes.json() as any;
    const res = await client.patch(`${issuesUrl()}${created.id}/`, { name: "Updated Name", priority: "medium" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.name).toBe("Updated Name");
    expect(data.priority).toBe("medium");
  });

  it("delete issue returns 204", async () => {
    const createRes = await client.post(issuesUrl(), { name: "Delete Me" });
    const created = await createRes.json() as any;
    const res = await client.delete(`${issuesUrl()}${created.id}/`);
    expect(res.status).toBe(204);
    const getRes = await client.get(`${issuesUrl()}${created.id}/`);
    expect(getRes.status).toBe(404);
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  it("create comment on issue", async () => {
    const issueRes = await client.post(issuesUrl(), { name: "Issue with comment" });
    const issue = await issueRes.json() as any;
    const commentsUrl = `${issuesUrl()}${issue.id}/comments/`;

    const res = await client.post(commentsUrl, { comment_html: "<p>Great issue!</p>" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.comment_html).toBe("<p>Great issue!</p>");
  });

  it("list comments", async () => {
    const issueRes = await client.post(issuesUrl(), { name: "Issue with comments" });
    const issue = await issueRes.json() as any;
    const commentsUrl = `${issuesUrl()}${issue.id}/comments/`;
    await client.post(commentsUrl, { comment_html: "<p>Comment 1</p>" });
    await client.post(commentsUrl, { comment_html: "<p>Comment 2</p>" });

    const res = await client.get(commentsUrl);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total_count).toBe(2);
  });

  // ── Links ──────────────────────────────────────────────────────────────────

  it("create link on issue", async () => {
    const issueRes = await client.post(issuesUrl(), { name: "Issue with link" });
    const issue = await issueRes.json() as any;
    const linksUrl = `${issuesUrl()}${issue.id}/links/`;

    const res = await client.post(linksUrl, { url: "https://example.com", title: "Example" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.url).toBe("https://example.com");
  });

  // ── Relations ──────────────────────────────────────────────────────────────

  it("create relation between issues", async () => {
    const issue1Res = await client.post(issuesUrl(), { name: "Issue A" });
    const issue1 = await issue1Res.json() as any;
    const issue2Res = await client.post(issuesUrl(), { name: "Issue B" });
    const issue2 = await issue2Res.json() as any;

    const relationsUrl = `${issuesUrl()}${issue1.id}/relations/`;
    const res = await client.post(relationsUrl, { related_issue: issue2.id, relation_type: "relates_to" });
    expect(res.status).toBe(201);
  });

  // ── Legacy ticket number ────────────────────────────────────────────────────

  it("create issue with legacy_ticket_number", async () => {
    const res = await client.post(issuesUrl(), { name: "Migrated Issue", legacy_ticket_number: "1234-2024" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.legacy_ticket_number).toBe("1234-2024");
  });

  it("filter issues by legacy_ticket_number", async () => {
    await client.post(issuesUrl(), { name: "Old Ticket", legacy_ticket_number: "9999-2023" });
    const res = await client.get(`${issuesUrl()}?legacy_ticket_number=9999-2023`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results.some((i: any) => i.legacy_ticket_number === "9999-2023")).toBe(true);
  });
});
