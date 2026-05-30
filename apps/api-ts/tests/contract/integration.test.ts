import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, createIssue, apiClient } from "@tests/helpers/factory";

describe("TestGitIntegrationAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let configId: string;
  let repoId: string;
  let issueId: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    const issue = await createIssue(project.id, ws.id, { name: "Bug linked to GitHub" });
    issueId = issue.id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const cfgUrl = () => `/workspaces/${wsSlug}/git/configs/`;

  it("create git config returns 201", async () => {
    const res = await client.post(cfgUrl(), { provider: "github", app_id: "123456", is_active: true });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    configId = data.id;
    expect(data.provider).toBe("github");
  });

  it("create duplicate git config returns 409", async () => {
    const res = await client.post(cfgUrl(), { provider: "github" });
    expect(res.status).toBe(409);
  });

  it("create gitlab config succeeds", async () => {
    const res = await client.post(cfgUrl(), { provider: "gitlab", is_active: true });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.provider).toBe("gitlab");
    // cleanup
    await client.delete(`${cfgUrl()}${data.id}/`);
  });

  it("list git configs", async () => {
    const res = await client.get(cfgUrl());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true);
  });

  it("update git config", async () => {
    const res = await client.patch(`${cfgUrl()}${configId}/`, { is_active: false, installation_id: "inst-42" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.is_active ?? data.isActive).toBe(false);
  });

  it("add repository to config returns 201", async () => {
    const repoUrl = `/workspaces/${wsSlug}/git/configs/${configId}/repositories/`;
    const res = await client.post(repoUrl, {
      repo_id: "gh-42", name: "my-repo", full_name: "org/my-repo",
      url: "https://github.com/org/my-repo", sync_enabled: true,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    repoId = data.id;
    expect(data.name).toBe("my-repo");
  });

  it("list repositories", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/git/configs/${configId}/repositories/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBeGreaterThanOrEqual(1);
  });

  it("create issue link returns 201", async () => {
    const res = await client.post(`/workspaces/${wsSlug}/git/repositories/${repoId}/issue-links/`, {
      issue_id: issueId,
      git_issue_id: "gh-issue-999",
      git_issue_url: "https://github.com/org/my-repo/issues/999",
      git_issue_num: 999,
      git_issue_title: "Fix segfault",
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.git_issue_num ?? data.gitIssueNum).toBe(999);
  });

  it("list issue links", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/git/repositories/${repoId}/issue-links/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.results).toBeInstanceOf(Array);
  });

  it("update repository sync_enabled", async () => {
    const res = await client.patch(`/workspaces/${wsSlug}/git/repositories/${repoId}/`, { sync_enabled: false });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.sync_enabled ?? data.syncEnabled).toBe(false);
  });

  it("delete git config returns 204", async () => {
    const res = await client.delete(`${cfgUrl()}${configId}/`);
    expect(res.status).toBe(204);
  });
});

describe("TestSlackIntegrationAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  const cfgUrl = () => `/workspaces/${wsSlug}/slack/config/`;

  it("GET slack config when not configured returns message", async () => {
    const res = await client.get(cfgUrl());
    expect(res.status).toBe(200);
  });

  it("create slack config returns 201", async () => {
    const res = await client.post(cfgUrl(), { bot_token: "xoxb-test", team_id: "T0000001", team_name: "TestTeam" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.team_name ?? data.teamName).toBe("TestTeam");
  });

  it("create duplicate slack config returns 409", async () => {
    const res = await client.post(cfgUrl(), { bot_token: "xoxb-another" });
    expect(res.status).toBe(409);
  });

  it("update slack config", async () => {
    const res = await client.patch(cfgUrl(), { is_active: false });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.is_active ?? data.isActive).toBe(false);
  });

  it("add project channel returns 201", async () => {
    // Re-enable first
    await client.patch(cfgUrl(), { is_active: true });
    const res = await client.post(`/workspaces/${wsSlug}/slack/channels/`, {
      project_id: projectId, channel_id: "C0000001", channel_name: "#general",
      events: ["issue_created", "issue_updated"], is_active: true,
    });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.channel_name ?? data.channelName).toBe("#general");
  });

  it("list channels", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/slack/channels/`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true);
  });

  it("delete slack config returns 204", async () => {
    const res = await client.delete(cfgUrl());
    expect(res.status).toBe(204);
  });
});
