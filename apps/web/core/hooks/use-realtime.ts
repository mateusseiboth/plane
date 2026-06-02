/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";

// Client side of the SSE realtime bus (server: apps/api-ts modules/realtime).
// One EventSource per workspace feeds every subscriber; views revalidate the
// affected data when a matching event arrives. See use-realtime usage in the
// workspace wrapper (channel) and the layout/intake/activity roots (refetch).

export type RealtimeEntity = "issue" | "comment" | "intake" | "reaction" | "cycle" | "module" | "state";
export type RealtimeAction = "create" | "update" | "delete";

export type RealtimeEvent = {
  entity: RealtimeEntity;
  action: RealtimeAction;
  project_id?: string | null;
  id?: string | null;
  issue_id?: string | null;
  actor?: string | null;
  ts?: number;
};

type Handler = (event: RealtimeEvent) => void;

const handlers = new Set<Handler>();
let source: EventSource | null = null;
let connectedSlug = "";

function connect(slug: string) {
  if (typeof window === "undefined" || !slug) return;
  if (source && connectedSlug === slug) return;
  source?.close();
  connectedSlug = slug;
  // nginx rewrites /api/* → /api/v1/*; EventSource sends the auth cookie (same-origin).
  source = new EventSource(`/api/workspaces/${slug}/realtime/stream/`);
  source.onmessage = (ev) => {
    try {
      const event = JSON.parse(ev.data) as RealtimeEvent;
      handlers.forEach((h) => {
        try {
          h(event);
        } catch {
          // a broken subscriber must not break the others
        }
      });
    } catch {
      // ignore keep-alive comments / malformed frames
    }
  };
  // EventSource reconnects automatically on error using the server's `retry:` hint.
}

/** Open (once) the workspace realtime channel. Mount high in the tree. */
export function useRealtimeChannel(slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    connect(slug);
  }, [slug]);
}

/** Run `refetch` (debounced) whenever an event passing `shouldHandle` arrives. */
export function useRealtimeRefetch(
  shouldHandle: (event: RealtimeEvent) => boolean,
  refetch: () => void,
  debounceMs = 350
) {
  const shouldRef = useRef(shouldHandle);
  const refetchRef = useRef(refetch);
  shouldRef.current = shouldHandle;
  refetchRef.current = refetch;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler: Handler = (event) => {
      if (!shouldRef.current(event)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refetchRef.current(), debounceMs);
    };
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (timer) clearTimeout(timer);
    };
  }, [debounceMs]);
}
