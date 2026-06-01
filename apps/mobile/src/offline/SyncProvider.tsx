import NetInfo from "@react-native-community/netinfo";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, endpoints } from "@/api";
import {
  makeLocalId,
  OutboxItem,
  OutboxKind,
  outboxAdd,
  outboxAll,
  outboxRemove,
  outboxReplace,
} from "./storage";

type SyncContextValue = {
  online: boolean;
  syncing: boolean;
  pending: OutboxItem[];
  pendingCount: number;
  /** Queue a new item for sync; returns the optimistic local id. */
  enqueue: (input: {
    kind: OutboxKind;
    slug: string;
    projectId?: string;
    label: string;
    body: Record<string, unknown>;
  }) => Promise<string>;
  /** Attempt to flush the outbox now. */
  syncNow: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

async function performOutbox(item: OutboxItem): Promise<void> {
  switch (item.kind) {
    case "work-item":
      await endpoints.issues.create(item.slug, item.projectId!, item.body);
      return;
    case "intake":
      // Intake items are created through the issues endpoint with triage intent.
      await endpoints.issues.create(item.slug, item.projectId!, { ...item.body, is_draft: false });
      return;
    case "visit":
      await endpoints.visits.create(item.slug, item.body);
      return;
    case "entity":
      await endpoints.entities.create(item.slug, item.body);
      return;
    case "page":
      await endpoints.pages.create(item.slug, item.body);
      return;
  }
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState<OutboxItem[]>([]);
  const syncingRef = useRef(false);

  const reload = useCallback(async () => setPending(await outboxAll()), []);

  useEffect(() => {
    reload();
  }, [reload]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    const state = await NetInfo.fetch();
    if (!state.isConnected) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      let items = await outboxAll();
      for (const item of items) {
        try {
          await performOutbox(item);
          await outboxRemove(item.localId);
        } catch (e) {
          if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
            // Validation/permission error: keep but mark so we stop retrying blindly.
            item.attempts += 1;
            item.error = e.detail;
            const all = await outboxAll();
            await outboxReplace(all.map((i) => (i.localId === item.localId ? item : i)));
          } else {
            // Network / server error: stop the pass, retry on next connectivity.
            break;
          }
        }
      }
      items = await outboxAll();
      setPending(items);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  // Connectivity listener — flush whenever we come back online.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const isOnline = Boolean(state.isConnected);
      setOnline(isOnline);
      if (isOnline) syncNow();
    });
    return () => unsub();
  }, [syncNow]);

  const enqueue = useCallback<SyncContextValue["enqueue"]>(
    async (input) => {
      const localId = makeLocalId();
      const item: OutboxItem = { localId, attempts: 0, createdAt: Date.now(), ...input };
      await outboxAdd(item);
      await reload();
      // Best-effort immediate flush if connected.
      syncNow();
      return localId;
    },
    [reload, syncNow],
  );

  const value = useMemo<SyncContextValue>(
    () => ({
      online,
      syncing,
      pending,
      pendingCount: pending.length,
      enqueue,
      syncNow,
    }),
    [online, syncing, pending, enqueue, syncNow],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used within SyncProvider");
  return ctx;
}
