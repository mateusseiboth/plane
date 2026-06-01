let _baseUrl = "";
let _pluginId = "";

export function configureHttp(baseUrl: string, pluginId: string) {
  _baseUrl = baseUrl.replace(/\/$/, "");
  _pluginId = pluginId;
}

export async function sdkFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${_baseUrl}/api/v1/plugin-sdk${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    credentials: "include",
    headers: {
      "X-Plugin-Id": _pluginId,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.detail ?? `SDK request failed (${res.status}): ${path}`);
  }

  return res.json() as Promise<T>;
}
