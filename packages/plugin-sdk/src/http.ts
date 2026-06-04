let _baseUrl = "";
let _pluginId = "";

export function configureHttp(baseUrl: string, pluginId: string) {
  _baseUrl = baseUrl.replace(/\/$/, "");
  _pluginId = pluginId;
}

/** Internal: base URL of the plugin-sdk gateway (no trailing slash). */
export function sdkGatewayBase(): string {
  return `${_baseUrl}/api/v1/plugin-sdk`;
}

export function currentPluginId(): string {
  return _pluginId;
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${sdkGatewayBase()}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export interface SdkRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Query-string params. */
  query?: Record<string, string | number | boolean | undefined>;
  /** JSON body (object) — serialized automatically. Use FormData for uploads. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * GET helper returning parsed JSON. Kept for backward compatibility: the second
 * argument is a flat query object (the existing data APIs rely on this shape).
 */
export async function sdkFetch<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const res = await fetch(buildUrl(path, params), {
    credentials: "include",
    headers: { "X-Plugin-Id": _pluginId, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.detail ?? `SDK request failed (${res.status}): ${path}`);
  }
  return res.json() as Promise<T>;
}

/**
 * General request helper (G6): any method + JSON body + query → parsed JSON.
 * Use for config/permissions and any future mutating gateway routes.
 */
export async function sdkRequest<T>(path: string, opts: SdkRequestOptions = {}): Promise<T> {
  const res = await sdkFetchRaw(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.detail ?? `SDK request failed (${res.status}): ${path}`);
  }
  const text = await res.text(); // tolerate empty (204) bodies
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Low-level helper returning the raw Response (streaming, blobs, downloads). */
export function sdkFetchRaw(path: string, opts: SdkRequestOptions = {}): Promise<Response> {
  const isJsonBody = opts.body !== undefined && !(opts.body instanceof FormData);
  return fetch(buildUrl(path, opts.query), {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    credentials: "include",
    headers: {
      "X-Plugin-Id": _pluginId,
      ...(isJsonBody ? { "Content-Type": "application/json" } : {}),
      ...opts.headers,
    },
    body:
      opts.body === undefined
        ? undefined
        : opts.body instanceof FormData
          ? (opts.body as FormData)
          : JSON.stringify(opts.body),
    signal: opts.signal,
  });
}
