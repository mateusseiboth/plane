import {authPlugin} from "@middleware/auth";
import {subscribeRealtime, type RealtimeEvent} from "@utils/realtime";
import {getWorkspaceOrFail, requireWorkspaceMember} from "@utils/workspace";
import Elysia from "elysia";

// Server-Sent Events stream of workspace mutations. The browser opens one
// EventSource per workspace and revalidates the affected view on each event.
//
// SSE (not WebSocket) so it rides the existing nginx /api proxy unchanged — the
// `X-Accel-Buffering: no` header disables nginx buffering for this response, and a
// periodic comment ping keeps the connection past proxy_read_timeout.
export const realtimeModule = new Elysia()
  .use(authPlugin)
  .get("/workspaces/:slug/realtime/stream/", async ({params: {slug}, user, request}) => {
    const ws = await getWorkspaceOrFail(slug);
    await requireWorkspaceMember(ws.id, user.id);

    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const safeEnqueue = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // controller already closed (client gone) — handled by cleanup below
          }
        };

        // Initial comment so the browser marks the stream open immediately.
        safeEnqueue(`: connected ${Date.now()}\n\n`);
        // Tell the client how often to retry if the connection drops.
        safeEnqueue(`retry: 3000\n\n`);

        const unsubscribe = subscribeRealtime(ws.id, (event: RealtimeEvent) => {
          safeEnqueue(`data: ${JSON.stringify(event)}\n\n`);
        });

        // Heartbeat keeps nginx/proxies from closing an idle connection.
        const ping = setInterval(() => safeEnqueue(`: ping\n\n`), 25000);

        const cleanup = () => {
          clearInterval(ping);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed
          }
        };

        // Fired when the browser disconnects (tab closed, navigation, network).
        request.signal.addEventListener("abort", cleanup);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Disable nginx response buffering for this endpoint only.
        "X-Accel-Buffering": "no",
      },
    });
  });
