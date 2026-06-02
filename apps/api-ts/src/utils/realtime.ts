// Lightweight in-process realtime bus (SSE).
//
// Mutation endpoints call publishRealtime(workspaceId, event); the realtime SSE
// endpoint (modules/realtime) streams those events to every browser connected to
// that workspace, and the web app revalidates the affected view. This is a
// "something changed, refetch" signal — small and order-independent — not a CRDT.
//
// Single-process only (one api-ts container). If this is ever scaled out, back the
// bus with Redis pub/sub (valkey is already in docker-compose) by fanning
// publishRealtime through Redis and subscribing on each instance.

export type RealtimeEntity =
  | "issue"
  | "comment"
  | "intake"
  | "reaction"
  | "cycle"
  | "module"
  | "state";

export type RealtimeAction = "create" | "update" | "delete";

export type RealtimeEvent = {
  entity: RealtimeEntity;
  action: RealtimeAction;
  project_id?: string | null;
  /** Primary id of the affected entity (issue id, comment id, …). */
  id?: string | null;
  /** Related issue id, when the entity hangs off an issue (comments, reactions). */
  issue_id?: string | null;
  /** Actor that triggered the change, so clients can ignore their own echoes. */
  actor?: string | null;
  ts?: number;
};

type Listener = (event: RealtimeEvent) => void;

const channels = new Map<string, Set<Listener>>();

export function subscribeRealtime(workspaceId: string, listener: Listener): () => void {
  let set = channels.get(workspaceId);
  if (!set) {
    set = new Set();
    channels.set(workspaceId, set);
  }
  set.add(listener);
  return () => {
    const s = channels.get(workspaceId);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) channels.delete(workspaceId);
  };
}

export function publishRealtime(workspaceId: string | null | undefined, event: RealtimeEvent): void {
  if (!workspaceId) return;
  const set = channels.get(workspaceId);
  if (!set || set.size === 0) return;
  const payload: RealtimeEvent = {...event, ts: Date.now()};
  for (const listener of set) {
    try {
      listener(payload);
    } catch {
      // a slow/broken consumer must never break the publisher
    }
  }
}
