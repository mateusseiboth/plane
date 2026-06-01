/**
 * Local persistence: a simple JSON cache for read models and an outbox queue for
 * offline-created items. Per product rule, only *new* items are queued for sync
 * (no offline edits/deletes), which keeps conflict resolution trivial.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const CACHE_PREFIX = "aviao.cache.";
const OUTBOX_KEY = "aviao.outbox";

// ── Read cache ────────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

// ── Outbox (offline-created items pending sync) ───────────────────────────────

export type OutboxKind = "work-item" | "intake" | "visit" | "entity" | "page";

export type OutboxItem = {
  /** Local id, also used as the optimistic record id (prefixed `local:`). */
  localId: string;
  kind: OutboxKind;
  slug: string;
  projectId?: string;
  /** Human label for the pending banner. */
  label: string;
  body: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  /** Last error message, if a sync attempt failed for a non-retryable reason. */
  error?: string;
};

export function makeLocalId(): string {
  return `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

export async function outboxAll(): Promise<OutboxItem[]> {
  return (await cacheGetRaw<OutboxItem[]>(OUTBOX_KEY)) ?? [];
}

export async function outboxAdd(item: OutboxItem): Promise<void> {
  const all = await outboxAll();
  all.push(item);
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(all));
}

export async function outboxReplace(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export async function outboxRemove(localId: string): Promise<void> {
  const all = await outboxAll();
  await outboxReplace(all.filter((i) => i.localId !== localId));
}

async function cacheGetRaw<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
