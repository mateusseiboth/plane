import prisma from "@db";
import {authPlugin} from "@middleware/auth";
import {paginate} from "@utils/pagination";
import {getWorkspaceOrFail, requireWorkspaceMember, requireWorkspaceWriter} from "@utils/workspace";
import Elysia from "elysia";

// Serialize a provider to the snake_case shape the frontend (and our POST/PATCH
// bodies) use. The api key is NEVER returned — only a boolean flag — so the edit
// form starts with an empty key field and an unchanged key is preserved.
function serializeProvider(p: any) {
  return {
    id: p.id,
    name: p.name,
    provider_type: p.providerType,
    base_url: p.baseUrl ?? null,
    default_model: p.defaultModel ?? null,
    timeout_secs: p.timeoutSecs ?? 30,
    is_active: p.isActive,
    is_default: p.isDefault,
    has_api_key: !!p.apiKey,
    // For "custom" providers: how to parse the response (openai | ollama | anthropic | text).
    response_format: (p.metadata as any)?.response_format ?? "openai",
    created_at: p.createdAt ?? null,
  };
}

export const aiModule = new Elysia({prefix: "/workspaces/:slug"})
  .use(authPlugin)

  // ── AI Provider Management ─────────────────────────────────────────────────

  .get("/ai-providers/", async ({params: {slug}, user, query}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const where = {workspaceId: ws.id, deletedAt: null};
    return paginate({
      query: async (skip, take) =>
        (
          await prisma.aiProvider.findMany({
            where,
            skip,
            take,
            select: {
              id: true,
              name: true,
              providerType: true,
              baseUrl: true,
              defaultModel: true,
              timeoutSecs: true,
              isActive: true,
              isDefault: true,
              apiKey: true,
              metadata: true,
              createdAt: true,
            },
            orderBy: {name: "asc"},
          })
        ).map(serializeProvider),
      count: () => prisma.aiProvider.count({where}),
      cursor: query.cursor as string | undefined,
    });
  })

  .post("/ai-providers/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (!b.name || !b.provider_type) {
      set.status = 400;
      return {detail: "name and provider_type are required."};
    }

    // If setting as default, unset others
    if (b.is_default) {
      await prisma.aiProvider.updateMany({where: {workspaceId: ws.id, deletedAt: null}, data: {isDefault: false}});
    }

    try {
      const provider = await prisma.aiProvider.create({
        data: {
          workspaceId: ws.id,
          name: b.name,
          providerType: b.provider_type,
          baseUrl: b.base_url ?? null,
          apiKey: b.api_key ?? null,
          defaultModel: b.default_model ?? null,
          timeoutSecs: b.timeout_secs ?? 30,
          isActive: b.is_active ?? true,
          isDefault: b.is_default ?? false,
          metadata: {...(b.metadata ?? {}), ...(b.response_format ? {response_format: b.response_format} : {})},
          createdById: user.id,
        },
      });
      set.status = 201;
      return serializeProvider(provider);
    } catch (e: any) {
      if (e?.code === "P2002") {
        set.status = 409;
        return {detail: "AI provider with this name already exists."};
      }
      throw e;
    }
  })

  .get("/ai-providers/:provider_id/", async ({params: {slug, provider_id}, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const p = await prisma.aiProvider.findFirstOrThrow({where: {id: provider_id, workspaceId: ws.id, deletedAt: null}});
    return serializeProvider(p);
  })

  .patch("/ai-providers/:provider_id/", async ({params: {slug, provider_id}, body, user}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    const b = body as any;
    if (b.is_default) {
      await prisma.aiProvider.updateMany({where: {workspaceId: ws.id, deletedAt: null}, data: {isDefault: false}});
    }
    const data: any = {};
    if (b.name !== undefined) data.name = b.name;
    if (b.base_url !== undefined) data.baseUrl = b.base_url;
    // Only overwrite the key when a non-empty value is sent (the edit form leaves
    // it blank to keep the existing key — never send "" or it would be wiped).
    if (typeof b.api_key === "string" && b.api_key.trim() !== "") data.apiKey = b.api_key;
    if (b.default_model !== undefined) data.defaultModel = b.default_model;
    if (b.timeout_secs !== undefined) data.timeoutSecs = b.timeout_secs;
    if (b.is_active !== undefined) data.isActive = b.is_active;
    if (b.is_default !== undefined) data.isDefault = b.is_default;
    if (b.response_format !== undefined) {
      const current = await prisma.aiProvider.findUnique({where: {id: provider_id}, select: {metadata: true}});
      data.metadata = {...((current?.metadata as any) ?? {}), response_format: b.response_format};
    }
    const p = await prisma.aiProvider.update({where: {id: provider_id}, data});
    return serializeProvider(p);
  })

  .delete("/ai-providers/:provider_id/", async ({params: {slug, provider_id}, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceWriter(ws.id, user.id);
    await prisma.aiProvider.update({where: {id: provider_id}, data: {deletedAt: new Date()}});
    set.status = 204;
    return null;
  })

  // ── AI Features (issue assistant) ─────────────────────────────────────────

  .post("/ai-assistant/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: {workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null},
    });
    if (!provider) {
      set.status = 400;
      return {detail: "No active AI provider configured."};
    }

    const b = body as any;
    const task = b.task ?? "summarize"; // summarize | suggest_description | suggest_label | suggest_assignee
    const content = b.content ?? b.issue_description ?? "";

    try {
      const response = await callAiProvider(provider, task, content);
      return {response, task, model: provider.defaultModel};
    } catch (e: any) {
      set.status = 502;
      return {detail: `AI provider error: ${e.message}`};
    }
  })

  // ── Text improvement (Melhorar com IA) ──────────────────────────────────────

  .post("/ai-assistant/improve-text/", async ({params: {slug}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: {workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null},
    });
    if (!provider) {
      set.status = 400;
      return {detail: "Nenhum provedor de IA configurado. Acesse Configurações → Provedores de IA."};
    }

    const b = body as any;
    const inputHtml: string = b.content ?? "";
    if (!inputHtml || inputHtml === "<p></p>") {
      set.status = 400;
      return {detail: "Nenhum texto para melhorar."};
    }

    // ── Build the SYSTEM message from the work-item context ───────────────────
    // Everything the caller knows about the item (title, project, status, priority,
    // assignees, prior comments/interactions) becomes context for the model. The
    // text to improve goes in the USER message.
    const ctx = b.context ?? {};
    function stripHtml(html: string): string {
      return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    const plainText = stripHtml(inputHtml);

    // ~4 chars/token for pt-BR; keep the whole request within ~4k tokens.
    const CHARS_PER_TOKEN = 4;
    const TOKEN_BUDGET = 3800;

    const sysLines: string[] = [
      "Você é um revisor de texto especializado em comunicação técnica da empresa Quality Sistemas.",
      "Seu trabalho é reescrever o texto do usuário de forma mais clara, profissional, bem estruturada e compreensível.",
      "REGRAS OBRIGATÓRIAS:",
      "1. REESCREVA o texto mantendo TODAS as informações técnicas originais (nomes de telas, caminhos, versões, erros, passos).",
      "2. NUNCA remova informações técnicas do texto original.",
      "3. Corrija erros de português (ortografia, concordância, acentuação).",
      "4. Organize o texto em parágrafos claros. Use listas quando houver passos ou itens.",
      "5. Use linguagem profissional, porém acessível (não use palavras rebuscadas desnecessariamente).",
      "6. Se o texto original menciona código, caminhos de arquivos ou comandos, mantenha-os EXATAMENTE como estão.",
      "7. Quando o texto usar termos técnicos (ex: banco de dados, API, servidor, cache, deploy, backup), adicione uma breve explicação entre parênteses para leigos.",
      "8. Você PODE e DEVE adicionar informações complementares e explicações relevantes ao contexto; sinalize essas adições naturalmente.",
      "9. Se o texto for vago ou incompleto, tente detalhar com base no contexto e histórico do chamado.",
      "10. Responda EXCLUSIVAMENTE com o texto reescrito. Sem prefácios, explicações, cumprimentos ou comentários.",
      "11. NÃO comece com 'Aqui está', 'Segue', 'Claro' ou qualquer introdução; comece direto com o texto melhorado.",
      "12. Se o texto for muito curto (1-2 frases), corrija e melhore a clareza; você pode expandir com explicações úteis se fizer sentido.",
      "13. Use HTML para formatação (negrito <strong>, listas <ul>/<ol>, parágrafos <p>); NÃO use Markdown.",
      "CONTEXTO (use apenas para entender o assunto, NÃO inclua no resultado):",
      "- Este texto é uma mensagem de um chamado (ticket de suporte) da empresa.",
    ];
    if (ctx.project_name) sysLines.push(`Sistema/Projeto: ${ctx.project_name}`);
    if (ctx.issue_title) sysLines.push(`Título: ${ctx.issue_title}`);
    if (ctx.status) sysLines.push(`Status: ${ctx.status}`);
    if (ctx.priority) sysLines.push(`Prioridade: ${ctx.priority}`);
    if (Array.isArray(ctx.assignees) && ctx.assignees.length) sysLines.push(`Responsáveis: ${ctx.assignees.join(", ")}`);
    let system = sysLines.join("\n");

    const prevComments: string[] = Array.isArray(ctx.previous_comments) ? ctx.previous_comments : [];
    if (prevComments.length) {
      const budgetForComments = Math.floor((TOKEN_BUDGET * CHARS_PER_TOKEN - system.length) * 0.35);
      let used = 0;
      const picked: string[] = [];
      for (const c of prevComments) {
        const line = `- ${c}`;
        if (used + line.length > budgetForComments) break;
        picked.push(line);
        used += line.length;
      }
      if (picked.length) system += `\nComentários/interações anteriores (mais recente primeiro):\n${picked.join("\n")}`;
    }

    const remaining = TOKEN_BUDGET * CHARS_PER_TOKEN - system.length - 300;
    const truncatedText = plainText.slice(0, Math.max(200, remaining));
    const userMessage =
      `Melhore o seguinte texto: corrija erros ortográficos/gramaticais e melhore a clareza e o profissionalismo, ` +
      `mantendo o mesmo significado e idioma. Retorne APENAS o texto melhorado em HTML, sem explicações:\n\n${truncatedText}`;

    try {
      const improved = await chatComplete(
        provider,
        [
          {role: "system", content: system},
          {role: "user", content: userMessage},
        ],
        {temperature: 0.7, maxTokens: 2048},
      );
      // Preserve HTML if the model returned it; otherwise wrap paragraphs.
      const isHtml = improved.trim().startsWith("<");
      const improvedHtml = isHtml
        ? improved.trim()
        : improved
            .split(/\n{2,}/)
            .map((p: string) => `<p>${p.replace(/\n/g, "<br>").trim()}</p>`)
            .filter((p: string) => p !== "<p></p>")
            .join("") || "<p></p>";
      return {response: improvedHtml, original: inputHtml};
    } catch (e: any) {
      set.status = 502;
      return {detail: `Erro no provedor de IA: ${e.message}`};
    }
  })

  .post("/projects/:project_id/ai-assistant/", async ({params: {slug, project_id}, body, user, set}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const provider = await prisma.aiProvider.findFirst({
      where: {workspaceId: ws.id, isDefault: true, isActive: true, deletedAt: null},
    });
    if (!provider || !provider.apiKey) {
      set.status = 400;
      return {detail: "No active AI provider configured."};
    }

    const b = body as any;
    const task = b.task ?? "summarize";
    const content = b.content ?? "";

    try {
      const response = await callAiProvider(provider, task, content);
      return {response, task, model: provider.defaultModel};
    } catch (e: any) {
      set.status = 502;
      return {detail: `AI provider error: ${e.message}`};
    }
  });

type ChatRole = "system" | "user" | "assistant";
type ChatMsg = {role: ChatRole; content: string};

function normalizeBaseUrl(provider: any): string {
  // Drop trailing slashes and a trailing "/v1" so we append the right path once.
  return (provider.baseUrl || getDefaultBaseUrl(provider.providerType)).replace(/\/+$/, "").replace(/\/v1$/, "");
}

// Parse the assistant text out of a provider response per the configured format.
function extractContent(data: any, format: string): string {
  switch ((format || "openai").toLowerCase()) {
    case "ollama":
      return data?.message?.content ?? data?.response ?? "";
    case "anthropic":
    case "claude":
      return data?.content?.[0]?.text ?? "";
    case "text":
    case "raw":
      return typeof data === "string" ? data : (data?.text ?? data?.output ?? data?.choices?.[0]?.text ?? "");
    case "openai":
    default:
      return data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? data?.message?.content ?? "";
  }
}

/**
 * Low-level chat completion. Sends an OpenAI-shaped { model, messages, temperature,
 * max_tokens } body and returns the assistant text. Branches by provider type:
 *  - custom:   POST EXACTLY to the configured base_url (no path appended); the
 *              response is parsed per the provider's response_format. Use this for
 *              proxies/gateways like https://host/api/ai/proxy.
 *  - anthropic: Messages API (system is a top-level field, not a message).
 *  - others:   OpenAI-compatible /v1/chat/completions (OpenAI, OpenRouter, Ollama).
 */
async function chatComplete(provider: any, messages: ChatMsg[], opts?: {temperature?: number; maxTokens?: number}): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 1024;
  const temperature = opts?.temperature ?? 0.7;
  const timeout = AbortSignal.timeout((provider.timeoutSecs ?? 60) * 1000);
  const model = provider.defaultModel || getDefaultModel(provider.providerType);

  if (provider.providerType === "custom") {
    const url = provider.baseUrl;
    if (!url) throw new Error("URL do provedor personalizado não configurada.");
    const headers: Record<string, string> = {"Content-Type": "application/json"};
    if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({model, messages, temperature, max_tokens: maxTokens}),
      signal: timeout,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const data = await res.json().catch(() => ({}));
    return extractContent(data, (provider.metadata as any)?.response_format ?? "openai");
  }

  if (provider.providerType === "anthropic") {
    const system =
      messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n") || undefined;
    const msgs = messages.filter((m) => m.role !== "system");
    const res = await fetch(`${normalizeBaseUrl(provider)}/v1/messages`, {
      method: "POST",
      headers: {"Content-Type": "application/json", "x-api-key": provider.apiKey ?? "", "anthropic-version": "2023-06-01"},
      body: JSON.stringify({model, max_tokens: maxTokens, temperature, ...(system ? {system} : {}), messages: msgs}),
      signal: timeout,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const data = (await res.json()) as any;
    return data?.content?.[0]?.text ?? "";
  }

  const headers: Record<string, string> = {"Content-Type": "application/json"};
  if (provider.apiKey) headers["Authorization"] = `Bearer ${provider.apiKey}`;
  const res = await fetch(`${normalizeBaseUrl(provider)}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({model, messages, temperature, max_tokens: maxTokens}),
    signal: timeout,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

// Single-prompt helper used by the simpler assistant endpoints.
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
  return chatComplete(provider, [{role: "user", content: prompt}]);
}

function getDefaultBaseUrl(type: string): string {
  const urls: Record<string, string> = {
    openai: "https://api.openai.com",
    anthropic: "https://api.anthropic.com",
    gemini: "https://generativelanguage.googleapis.com",
    openrouter: "https://openrouter.ai/api",
  };
  return urls[type] ?? "http://localhost:11434";
}

function getDefaultModel(type: string): string {
  const models: Record<string, string> = {
    openai: "gpt-4o-mini",
    anthropic: "claude-haiku-4-5-20251001",
    gemini: "gemini-1.5-flash",
    ollama: "llama3",
    openrouter: "openai/gpt-4o-mini",
  };
  return models[type] ?? "gpt-4o-mini";
}
