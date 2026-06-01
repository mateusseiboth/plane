/**
 * Push / local notifications for urgent tickets.
 *
 * Full remote push (APNs/FCM via Expo) requires an EAS project id and device
 * registration — we request permission and fetch the Expo push token so the
 * backend can target this device once that wiring exists. In the meantime we
 * poll the workspace notifications endpoint while the app is foregrounded and
 * raise a local notification for any new *urgent* item, so the experience works
 * end-to-end without server push.
 */
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { AppNotification, endpoints, Paginated } from "@/api";
import { useAuth } from "@/auth/AuthContext";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const POLL_MS = 60_000;

function isUrgent(n: AppNotification): boolean {
  const data = n.data ?? {};
  const priority = String((data as any).priority ?? (data as any).issue_priority ?? "").toLowerCase();
  const title = (n.title ?? "").toLowerCase();
  return priority === "urgent" || title.includes("urgente") || title.includes("urgent");
}

export function usePushNotifications() {
  const { status, activeWorkspace } = useAuth();
  const seen = useRef<Set<string>>(new Set());
  const slug = activeWorkspace?.slug;

  // Permission + token registration (best-effort).
  useEffect(() => {
    if (status !== "authenticated") return;
    (async () => {
      const settings = await Notifications.getPermissionsAsync();
      let granted = settings.granted;
      if (!granted) granted = (await Notifications.requestPermissionsAsync()).granted;
      if (!granted) return;
      try {
        await Notifications.getExpoPushTokenAsync();
        // TODO: POST the token to a device-registration endpoint when available.
      } catch {
        /* no EAS project id configured yet — local notifications still work */
      }
    })();
  }, [status]);

  // Foreground polling for urgent notifications.
  useEffect(() => {
    if (status !== "authenticated" || !slug) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (AppState.currentState !== "active") return;
      try {
        const res = await endpoints.notifications.list(slug, { per_page: 20 });
        const list: AppNotification[] = Array.isArray(res) ? res : (res as Paginated<AppNotification>).results ?? [];
        for (const n of list) {
          if (n.read_at) continue;
          if (!isUrgent(n)) continue;
          if (seen.current.has(n.id)) continue;
          seen.current.add(n.id);
          await Notifications.scheduleNotificationAsync({
            content: {
              title: n.title || "Chamado urgente",
              body: n.message ?? "Você recebeu um chamado urgente.",
              data: { notificationId: n.id, ...(n.data ?? {}) },
            },
            trigger: null,
          });
        }
      } catch {
        /* ignore poll errors */
      }
    };

    poll();
    timer = setInterval(poll, POLL_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status, slug]);
}
