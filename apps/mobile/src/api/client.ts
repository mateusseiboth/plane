/**
 * Thin fetch wrapper around the TypeScript API exposed through the gateway.
 *
 * - Base URL comes from EXPO_PUBLIC_API_URL (falls back to app.json `extra.apiUrl`).
 * - Auth uses a Bearer JWT (returned by /auth/sign-in/). The token is injected
 *   by a getter so the AuthProvider can rotate it without re-creating the client.
 * - Errors are normalised to ApiError with status + best-effort `detail` message.
 */
import Constants from "expo-constants";

const FALLBACK_URL = "http://localhost:8080";

export function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  const fromExtra = (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl;
  return (fromEnv || fromExtra || FALLBACK_URL).replace(/\/+$/, "");
}

export class ApiError extends Error {
  status: number;
  detail: string;
  body: unknown;
  constructor(status: number, detail: string, body: unknown) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

type TokenGetter = () => string | null;

let getToken: TokenGetter = () => null;

/** Wire the token source (called once by the AuthProvider). */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

function buildQuery(params?: QueryParams): string {
  if (!params) return "";
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

type RequestOptions = {
  params?: QueryParams;
  signal?: AbortSignal;
  /** Skip auth header (used by sign-in). */
  anonymous?: boolean;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const url = `${resolveBaseUrl()}${path}${buildQuery(opts.params)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts.anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // let fetch set the multipart boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: payload, signal: opts.signal });
  const parsed = await parseBody(res);

  if (!res.ok) {
    const detail =
      (parsed && typeof parsed === "object" && "detail" in parsed
        ? String((parsed as { detail: unknown }).detail)
        : undefined) ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, detail, parsed);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts),
};
