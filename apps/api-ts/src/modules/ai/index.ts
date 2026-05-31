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
    if (!provider) { set.status = 400; return { detail: "No active AI provider configured." }; }

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

  // ── Text improvement (Melhorar com IA) ──────────────────────────────────────

  .post("/ai-assistant/improve-text/", async ({ params: { slug }, body, user, set }) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: { workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null },
    });
    if (!provider) { set.status = 400; return { detail: "Nenhum provedor de IA configurado. Acesse Configurações → Provedores de IA." }; }

    const b = body as any;
    const inputHtml: string = b.content ?? "";
    if (!inputHtml || inputHtml === "<p></p>") {
      set.status = 400;
      return { detail: "Nenhum texto para melhorar." };
    }

    // ── Context from the caller ───────────────────────────────────────────────
    const ctx = b.context ?? {};
    const issueTitle: string = ctx.issue_title ?? "";
    const projectName: string = ctx.project_name ?? "";
    const prevComments: string[] = ctx.previous_comments ?? [];   // already stripped HTML

    // ── Strip HTML from input ─────────────────────────────────────────────────
    function stripHtml(html: string): string {
      return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    }
    const plainText = stripHtml(inputHtml);

    // ── Build context-aware prompt with 4 k-token budget ─────────────────────
    // Rough estimate: 1 token ≈ 4 chars for Portuguese text.
    const CHARS_PER_TOKEN = 4;
    const TOKEN_BUDGET = 3800; // leave ~200 tokens for response overhead
    let usedChars = 0;

    let prompt = `Você é um assistente de escrita técnica em português brasileiro.\n`;
    usedChars += prompt.length;

    if (projectName) {
      const line = `Sistema/Projeto: "${projectName}".\n`;
      prompt += line; usedChars += line.length;
    }
    if (issueTitle) {
      const line = `Título do work item: "${issueTitle}".\n`;
      prompt += line; usedChars += line.length;
    }

    const formattingHint = `O editor suporta formatação HTML (negrito <strong>, listas <ul>/<ol>, parágrafos <p>, etc.).\n`
      + `Use formatação quando melhorar a clareza, mas não exagere.\n`;
    prompt += formattingHint; usedChars += formattingHint.length;

    // Attach previous comments (most recent first), respecting token budget
    if (prevComments.length > 0) {
      const header = `\nContexto — comentários anteriores (do mais recente ao mais antigo):\n`;
      prompt += header; usedChars += header.length;
      const budgetForComments = Math.floor((TOKEN_BUDGET * CHARS_PER_TOKEN - usedChars) * 0.3); // 30% of remaining
      let commentChars = 0;
      for (const comment of prevComments) {
        const line = `- ${comment}\n`;
        if (commentChars + line.length > budgetForComments) break;
        prompt += line; usedChars += line.length; commentChars += line.length;
      }
    }

    // Truncate the content to fit remaining budget
    const remainingBudgetChars = TOKEN_BUDGET * CHARS_PER_TOKEN - usedChars - 200; // 200 chars safety margin
    const truncatedText = plainText.slice(0, Math.max(200, remainingBudgetChars));

    const instruction = `\nMelhore o seguinte texto: corrija erros ortográficos/gramaticais, melhore a clareza e o profissionalismo mantendo o mesmo significado. Retorne APENAS o texto melhorado em HTML, sem explicações adicionais:\n\n${truncatedText}`;
    prompt += instruction;

    try {
      const improved = await callAiProvider(provider, "improve_text_with_context", prompt);
      // Preserve HTML if model returned it; otherwise wrap paragraphs
      const isHtml = improved.trim().startsWith("<");
      const improvedHtml = isHtml
        ? improved.trim()
        : improved
            .split(/\n{2,}/)
            .map((p: string) => `<p>${p.replace(/\n/g, "<br>").trim()}</p>`)
            .filter((p: string) => p !== "<p></p>")
            .join("") || "<p></p>";
      return { response: improvedHtml, original: inputHtml };
    } catch (e: any) {
      set.status = 502;
      return { detail: `Erro no provedor de IA: ${e.message}` };
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
    improve_text: `Você é um assistente de escrita profissional em português. Melhore o texto abaixo: corrija erros ortográficos e gramaticais, melhore a clareza e o profissionalismo, mantendo o mesmo significado e idioma (português). Retorne APENAS o texto melhorado, sem explicações adicionais.\n\n${content}`,
    // For improve_text_with_context the caller builds the full prompt and passes it as content
    improve_text_with_context: content,
  };

  const prompt = prompts[task] ?? `${task}:\n\n${content}`;
  const baseUrl = provider.baseUrl ?? getDefaultBaseUrl(provider.providerType);
  const model = provider.defaultModel ?? getDefaultModel(provider.providerType);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Ollama and local providers may not need an API key
  if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 1024 }),
    signal: AbortSignal.timeout((provider.timeoutSecs ?? 60) * 1000),
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
