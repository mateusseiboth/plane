let _baseUrl = "";
let _widgetId = "";
let _workspaceSlug: string | undefined;

/**
 * `workspaceSlug` é o workspace em que o widget está aberto. Ele vai em toda
 * chamada como `workspace_slug` (a não ser que a chamada informe outro): as rotas
 * de dados do gateway exigem esse parâmetro.
 */
export function configureHttp(baseUrl: string, widgetId: string, workspaceSlug?: string) {
  _baseUrl = baseUrl.replace(/\/$/, "");
  _widgetId = widgetId;
  _workspaceSlug = workspaceSlug || undefined;
}

export async function sdkFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${_baseUrl}/api/v1/widget-sdk${path}`);
  const query = { ...params, workspace_slug: params?.workspace_slug ?? _workspaceSlug };
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: {
      "X-Widget-Id": _widgetId,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.detail ?? `SDK request failed (${res.status}): ${path}`);
  }

  return res.json() as Promise<T>;
}
