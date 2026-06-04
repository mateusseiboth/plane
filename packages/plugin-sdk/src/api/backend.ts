import { sdkGatewayBase, currentPluginId } from "../http";

// G3 — authenticated channel to the plugin's OWN backend, through the platform
// gateway proxy. The frontend never learns the backend URL/secrets: it calls
// `/api/v1/plugin-sdk/backend/*`; the gateway authenticates the user + X-Plugin-Id,
// signs an identity header set, and forwards to the backend registered in the
// plugin manifest. Generic: any plugin with a backend gets this for free.

function backendUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  return `${sdkGatewayBase()}/backend/${clean}`;
}

export const backendApi = {
  /** Authenticated fetch to the plugin backend (any method, JSON/blob/stream). */
  fetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(backendUrl(path), {
      ...init,
      credentials: "include",
      headers: { "X-Plugin-Id": currentPluginId(), ...(init.headers as Record<string, string>) },
    });
  },

  /** Upload a Blob/stream (multipart or raw) to the plugin backend. */
  upload(path: string, body: Blob | FormData | ReadableStream, meta?: { headers?: Record<string, string> }): Promise<Response> {
    return fetch(backendUrl(path), {
      method: "POST",
      credentials: "include",
      headers: { "X-Plugin-Id": currentPluginId(), ...(meta?.headers ?? {}) },
      body: body as BodyInit,
      // @ts-expect-error duplex is required by fetch for streaming bodies
      duplex: body instanceof ReadableStream ? "half" : undefined,
    });
  },

  /** Proxied URL for direct use (e.g. <a download>, <img>, EventSource). */
  url(path: string): string {
    return backendUrl(path);
  },
};
