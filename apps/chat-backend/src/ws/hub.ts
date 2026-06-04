// In-process WebSocket connection registry + presence.
// Decoupled from Elysia: the .ws() handlers call register/unregister/handle and
// use the send helpers. Single process; if scaled out, back the fan-out with
// Redis pub/sub (same pattern as the Plane SSE bus).

export type SocketKind = "client" | "attendant";

export interface SocketRecord {
  id: string;
  kind: SocketKind;
  workspaceId: string;
  /** session this socket is attached to (clients always; attendants when viewing one) */
  sessionId?: string;
  /** Plane user id (attendants only) */
  userId?: string;
  send: (data: unknown) => void;
  alive: boolean;
  lastPongAt: number;
}

const sockets = new Map<string, SocketRecord>();
const bySession = new Map<string, Set<string>>();
const byUser = new Map<string, Set<string>>();
const byWorkspace = new Map<string, Set<string>>();

function addIndex(map: Map<string, Set<string>>, key: string | undefined, id: string) {
  if (!key) return;
  let set = map.get(key);
  if (!set) map.set(key, (set = new Set()));
  set.add(id);
}
function removeIndex(map: Map<string, Set<string>>, key: string | undefined, id: string) {
  if (!key) return;
  const set = map.get(key);
  if (!set) return;
  set.delete(id);
  if (set.size === 0) map.delete(key);
}

export function register(record: SocketRecord) {
  sockets.set(record.id, record);
  addIndex(byWorkspace, record.workspaceId, record.id);
  addIndex(bySessionOrNoop(record), record.sessionId, record.id);
  addIndex(byUser, record.userId, record.id);
  if (record.userId) emitPresence(record.workspaceId);
}

function bySessionOrNoop(_r: SocketRecord) {
  return bySession;
}

export function attachSession(id: string, sessionId: string) {
  const rec = sockets.get(id);
  if (!rec) return;
  removeIndex(bySession, rec.sessionId, id);
  rec.sessionId = sessionId;
  addIndex(bySession, sessionId, id);
}

export function unregister(id: string) {
  const rec = sockets.get(id);
  if (!rec) return;
  sockets.delete(id);
  removeIndex(byWorkspace, rec.workspaceId, id);
  removeIndex(bySession, rec.sessionId, id);
  removeIndex(byUser, rec.userId, id);
  if (rec.userId && !byUser.has(rec.userId)) emitPresence(rec.workspaceId);
}

export function markPong(id: string) {
  const rec = sockets.get(id);
  if (rec) {
    rec.alive = true;
    rec.lastPongAt = Date.now();
  }
}

// ── send helpers ──────────────────────────────────────────────────────────────
function sendVia(ids: Set<string> | undefined, payload: unknown) {
  if (!ids) return;
  for (const id of ids) {
    const rec = sockets.get(id);
    if (!rec) continue;
    try {
      rec.send(payload);
    } catch {
      /* dead socket; cleaned on close */
    }
  }
}

export function sendToSession(sessionId: string, payload: unknown, kind?: SocketKind) {
  if (!kind) return sendVia(bySession.get(sessionId), payload);
  // Role-filtered fan-out (e.g. clients get a redacted edit/delete, staff get the
  // full original). Only delivers to sockets of the requested kind.
  const ids = bySession.get(sessionId);
  if (!ids) return;
  for (const id of ids) {
    const rec = sockets.get(id);
    if (rec && rec.kind === kind) {
      try {
        rec.send(payload);
      } catch {
        /* dead socket */
      }
    }
  }
}
export function sendToUser(userId: string, payload: unknown) {
  sendVia(byUser.get(userId), payload);
}
export function sendToWorkspace(workspaceId: string, payload: unknown) {
  sendVia(byWorkspace.get(workspaceId), payload);
}

// ── presence ──────────────────────────────────────────────────────────────────
/** User ids of attendants with at least one live socket in this workspace. */
export function connectedUserIds(workspaceId: string): Set<string> {
  const result = new Set<string>();
  const ids = byWorkspace.get(workspaceId);
  if (!ids) return result;
  for (const id of ids) {
    const rec = sockets.get(id);
    if (rec?.userId) result.add(rec.userId);
  }
  return result;
}

export function isUserConnected(userId: string): boolean {
  return byUser.has(userId);
}

/** Broadcast a presence snapshot (connected user ids) to a workspace. */
export function emitPresence(workspaceId: string) {
  const online = Array.from(connectedUserIds(workspaceId));
  sendToWorkspace(workspaceId, { type: "presence", online });
}

// ── heartbeat ─────────────────────────────────────────────────────────────────
// Every interval, ping everyone and drop sockets that missed the previous round.
export function startHeartbeat(intervalMs = 20000) {
  setInterval(() => {
    for (const rec of sockets.values()) {
      if (!rec.alive) {
        // missed last pong → consider dead
        unregister(rec.id);
        continue;
      }
      rec.alive = false;
      try {
        rec.send({ type: "ping", ts: Date.now() });
      } catch {
        unregister(rec.id);
      }
    }
  }, intervalMs);
}
