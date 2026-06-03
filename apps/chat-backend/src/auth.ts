// Auth for the chat backend.
//  - Attendants: the same Plane JWT (cookie plane_auth or Authorization: Bearer),
//    verified with the shared JWT_SECRET. No separate login.
//  - Clients (anonymous visitors): a lightweight signed "chat session token" we
//    mint ourselves, bound to a sessionId + browserId.

import { SignJWT, jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "plane-jwt-secret-change-in-production");

export type PlaneUser = { id: string; email?: string };

export async function verifyPlaneJwt(rawToken: string | null | undefined): Promise<PlaneUser | null> {
  if (!rawToken) return null;
  try {
    const { payload } = await jwtVerify(rawToken, SECRET);
    if (!payload.sub) return null;
    return { id: String(payload.sub), email: payload.email ? String(payload.email) : undefined };
  } catch {
    return null;
  }
}

/** Extract the Plane JWT from a request's cookie / Authorization header.
 *  Handles both Web API Headers objects (.get()) and plain record objects ([]) */
export function extractPlaneToken(headers: any): string | null {
  const get = (key: string): string | undefined =>
    typeof headers?.get === "function" ? (headers.get(key) ?? undefined) : headers?.[key];
  const auth = get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = get("cookie") ?? "";
  const m = cookie.match(/(?:^|;\s*)plane_auth=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

export async function resolveAttendant(headers: any): Promise<PlaneUser | null> {
  return verifyPlaneJwt(extractPlaneToken(headers));
}

// ── Short-lived WS tickets ────────────────────────────────────────────────────
// REST endpoint issues a 2-minute ticket; the WS open handler verifies it.
// Avoids relying on cookie forwarding from nginx to Bun's WS upgrade path.

export async function signWsTicket(userId: string, workspaceId: string): Promise<string> {
  return new SignJWT({ sub: userId, wid: workspaceId, role: "attendant-ws" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(SECRET);
}

export async function verifyWsTicket(token: string | null | undefined): Promise<{ userId: string; workspaceId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "attendant-ws" || !payload.sub || !payload.wid) return null;
    return { userId: String(payload.sub), workspaceId: String(payload.wid) };
  } catch {
    return null;
  }
}

// ── Client session tokens ─────────────────────────────────────────────────────

export async function signClientToken(sessionId: string, browserId: string): Promise<string> {
  return new SignJWT({ sid: sessionId, bid: browserId, role: "client" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyClientToken(token: string | null | undefined): Promise<{ sessionId: string; browserId: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "client" || !payload.sid) return null;
    return { sessionId: String(payload.sid), browserId: String(payload.bid ?? "") };
  } catch {
    return null;
  }
}
