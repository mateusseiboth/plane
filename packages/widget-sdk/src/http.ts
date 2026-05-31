let _baseUrl = "";
let _widgetId = "";

export function configureHttp(baseUrl: string, widgetId: string) {
  _baseUrl = baseUrl.replace(/\/$/, "");
  _widgetId = widgetId;
}

export async function sdkFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${_baseUrl}/api/v1/widget-sdk${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
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
