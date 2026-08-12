/**
 * Cliente dos provedores de IA cadastrados pelo espaço de trabalho (`AiProvider`).
 *
 * Estava dentro de `ai/index.ts`; saiu para cá quando o "Melhorar com IA" passou
 * a ter dois caminhos possíveis (provedor cadastrado ou IA de requisitos) e os
 * dois precisaram do mesmo cliente. **O comportamento é o mesmo de antes** —
 * este arquivo é um recorte, não uma reescrita.
 */

export type ChatRole = "system" | "user" | "assistant";
export type ChatMsg = {role: ChatRole; content: string};

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
export async function chatComplete(
  provider: any,
  messages: ChatMsg[],
  opts?: {temperature?: number; maxTokens?: number},
): Promise<string> {
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

export function getDefaultBaseUrl(type: string): string {
  const urls: Record<string, string> = {
    openai: "https://api.openai.com",
    anthropic: "https://api.anthropic.com",
    gemini: "https://generativelanguage.googleapis.com",
    openrouter: "https://openrouter.ai/api",
  };
  return urls[type] ?? "http://localhost:11434";
}

export function getDefaultModel(type: string): string {
  const models: Record<string, string> = {
    openai: "gpt-4o-mini",
    anthropic: "claude-haiku-4-5-20251001",
    gemini: "gemini-1.5-flash",
    ollama: "llama3",
    openrouter: "openai/gpt-4o-mini",
  };
  return models[type] ?? "gpt-4o-mini";
}

/**
 * Host do provedor, para a trilha de auditoria: diz PARA ONDE o texto foi, sem
 * caminho e sem credencial.
 */
export function hostDoProvedor(provider: any): string {
  try {
    return new URL(provider.baseUrl || getDefaultBaseUrl(provider.providerType)).host;
  } catch {
    return provider.providerType ?? "desconhecido";
  }
}
