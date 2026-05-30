import Elysia from "elysia";
import { authPlugin } from "@middleware/auth";
import prisma from "@db";
import { paginate } from "@utils/pagination";
import { getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter } from "@utils/workspace";

export const aiModule = new Elysia({ prefix: "/workspaces/:slug" })
  .use(authPlugin)

  // ── AI Provider Management ─────────────────────────────────────────────────

  .get("/ai-providers/", async ({ params: { slug }, user, query }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = { workspaceId: ws.id, deletedAt: null };
    return paginate({
      query: (skip, take) => prisma.aiProvider.findMany({
        where, skip, take,
        select: { id: true, name: true, providerType: true, baseUrl: true, defaultModel: true, timeoutSecs: true, isActive: true, isDefault: true, createdAt: true },
        orderBy: { name: "asc" },
      }),
      count: () => prisma.aiProvider.count({ where }),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/ai-providers/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name || !b.provider_type) { set.status = 400; return { detail: "name and provider_type are required." }; }

    // If setting as default, unset others
    if (b.is_default) {
      await prisma.aiProvider.updateMany({ where: { workspaceId: ws.id, deletedAt: null }, data: { isDefault: false } });
    }

    try {
      const provider = await prisma.aiProvider.create({
        data: {
          workspaceId: ws.id, name: b.name, providerType: b.provider_type,
          baseUrl: b.base_url ?? null, apiKey: b.api_key ?? null,
          defaultModel: b.default_model ?? null, timeoutSecs: b.timeout_secs ?? 30,
          isActive: b.is_active ?? true, isDefault: b.is_default ?? false,
          metadata: b.metadata ?? {}, createdById: user.id,
        },
      });
      set.status = 201;
      return { ...provider, api_key: provider.apiKey ? "***" : null };
    } catch (e: any) {
      if (e?.code === "P2002") { set.status = 409; return { detail: "AI provider with this name already exists." }; }
      throw e;
    }
  })

  .get("/ai-providers/:provider_id/", async ({ params: { slug, provider_id }, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const p = await prisma.aiProvider.findFirstOrThrow({ where: { id: provider_id, workspaceId: ws.id, deletedAt: null } });
    return { ...p, api_key: p.apiKey ? "***" : null };
  })

  .patch("/ai-providers/:provider_id/", async ({ params: { slug, provider_id }, body, user }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (b.is_default) {
      await prisma.aiProvider.updateMany({ where: { workspaceId: ws.id, deletedAt: null }, data: { isDefault: false } });
    }
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.base_url !== undefined) data.baseUrl = b.base_url;
    if (b.api_key !== undefined) data.apiKey = b.api_key;
    if (b.default_model !== undefined) data.defaultModel = b.default_model;
    if (b.timeout_secs !== undefined) data.timeoutSecs = b.timeout_secs;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.is_default !== undefined) data.isDefault = b.is_default;
    const p = await prisma.aiProvider.update({ where: { id: provider_id }, data });
    return { ...p, api_key: p.apiKey ? "***" : null };
  })

  .delete("/ai-providers/:provider_id/", async ({ params: { slug, provider_id }, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.aiProvider.update({ where: { id: provider_id }, data: { deletedAt: new Date() } });
    set.status = 204;
    return null;
  })

  // ── AI Features (issue assistant) ─────────────────────────────────────────

  .post("/ai-assistant/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: { workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null },
    });
    if (!provider || !provider.apiKey) { set.status = 400; return { detail: "No active AI provider configured." }; }

    const b = body as any;
    const task = b.task ?? "summarize"; // summarize | suggest_description | suggest_label | suggest_assignee
    const content = b.content ?? b.issue_description ?? "";

    try {
      const response = await callAiProvider(provider, task, content);
      return { response, task, model: provider.defaultModel };
    } catch (e: any) {
      set.status = 502;
      return { detail: `AI provider error: ${e.message}` };
    }
  })

  .post("/projects/:project_id/ai-assistant/", async ({ params: { slug, project_id }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: { workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null },
    });
    if (!provider || !provider.apiKey) { set.status = 400; return { detail: "No active AI provider configured." }; }

    const b = body as any;
    const task = b.task ?? "summarize";
    const content = b.content ?? "";

    try {
      const response = await callAiProvider(provider, task, content);
      return { response, task, model: provider.defaultModel };
    } catch (e: any) {
      set.status = 502;
      return { detail: `AI provider error: ${e.message}` };
    }
  });

async function callAiProvider(provider: any, task: string, content: string): Promise<string> {
  const prompts: Record<string, string> = {
    summarize: `Summarize this issue/task in 2-3 sentences:\n\n${content}`,
    suggest_description: `Write a clear, detailed description for this task:\n\n${content}`,
    generate_documentation: `Generate technical documentation for this:\n\n${content}`,
    suggest_response: `Suggest a helpful response to this support ticket:\n\n${content}`,
  };

  const prompt = prompts[task] ?? `${task}:\n\n${content}`;
  const baseUrl = provider.baseUrl ?? getDefaultBaseUrl(provider.providerType);
  const model = provider.defaultModel ?? getDefaultModel(provider.providerType);

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${provider.apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 512 }),
    signal: AbortSignal.timeout((provider.timeoutSecs ?? 30) * 1000),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as any;
  return data.choices?.[0]?.message?.content ?? "";
}

function getDefaultBaseUrl(type: string): string {
  const urls: Record<string, string> = {
    openai: "https://api.openai.com", anthropic: "https://api.anthropic.com",
    gemini: "https://generativelanguage.googleapis.com", openrouter: "https://openrouter.ai/api",
  };
  return urls[type] ?? "http://localhost:11434";
}

function getDefaultModel(type: string): string {
  const models: Record<string, string> = {
    openai: "gpt-4o-mini", anthropic: "claude-haiku-4-5-20251001",
    gemini: "gemini-1.5-flash", ollama: "llama3", openrouter: "openai/gpt-4o-mini",
  };
  return models[type] ?? "gpt-4o-mini";
}
