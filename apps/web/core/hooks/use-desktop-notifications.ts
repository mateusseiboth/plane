"use client";

import { useCallback, useEffect, useRef } from "react";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";

// ── Service helpers ─────────────────────────────────────────────────────────

class NotifService extends APIService {
  constructor() { super(API_BASE_URL); }
  unreadCount(slug: string) {
    return this.get(`/api/workspaces/${slug}/users/notifications/unread/`)
      .then((r) => r?.data?.total_unread_notifications ?? 0)
      .catch(() => 0);
  }
  urgentIssues(slug: string) {
    return this.get(`/api/workspaces/${slug}/urgent-issues/`)
      .then((r) => r?.data ?? [])
      .catch(() => []);
  }
}

const notifService = new NotifService();

// ── Utility ──────────────────────────────────────────────────────────────────

function requestPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return Promise.resolve("denied");
  if (Notification.permission === "granted") return Promise.resolve("granted");
  if (Notification.permission === "denied") return Promise.resolve("denied");
  return Notification.requestPermission();
}

function showNotification(title: string, body: string, tag?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, {
    body,
    tag,
    icon: "/plane-icon.svg",
    requireInteraction: false,
  });
}

// ── Hook ─────────────────────────────────────────────────────────────────────

type Options = {
  workspaceSlug: string;
  /** Poll interval in ms for unread notification check (default: 30s) */
  pollIntervalMs?: number;
  /** Recurring alarm interval for urgent issues if no changes (default: 3600s = 1h) */
  urgentAlarmIntervalMs?: number;
};

/**
 * useDesktopNotifications
 *
 * 1. Requests browser notification permission on mount.
 * 2. Polls for new unread notifications every `pollIntervalMs` and fires a
 *    desktop notification for each new batch (covers comments, state changes, etc.).
 * 3. Every `urgentAlarmIntervalMs`, checks if there are urgent unresolved issues
 *    and fires a recurring alarm notification if none have changed.
 */
export function useDesktopNotifications({
  workspaceSlug,
  pollIntervalMs = 30_000,
  urgentAlarmIntervalMs = 3_600_000,
}: Options) {
  const lastUnreadCount = useRef<number>(-1);
  const lastUrgentIds = useRef<Set<string>>(new Set());
  const lastUrgentStates = useRef<Map<string, string>>(new Map()); // id → stateId

  // Request permission once
  useEffect(() => {
    requestPermission();
  }, []);

  // Poll unread notifications
  useEffect(() => {
    if (!workspaceSlug) return;
    let active = true;

    const check = async () => {
      if (!active) return;
      const count: number = await notifService.unreadCount(workspaceSlug);
      if (lastUnreadCount.current >= 0 && count > lastUnreadCount.current) {
        const delta = count - lastUnreadCount.current;
        showNotification(
          `${delta} nova${delta > 1 ? "s" : ""} notificação${delta > 1 ? "ões" : ""}`,
          "Você tem atualizações em chamados que você segue.",
          "ws-notifications"
        );
      }
      lastUnreadCount.current = count;
    };

    check();
    const interval = setInterval(check, pollIntervalMs);
    return () => { active = false; clearInterval(interval); };
  }, [workspaceSlug, pollIntervalMs]);

  // Recurring alarm for urgent issues
  useEffect(() => {
    if (!workspaceSlug) return;
    let active = true;

    const checkUrgent = async () => {
      if (!active) return;
      const issues: any[] = await notifService.urgentIssues(workspaceSlug);
      if (issues.length === 0) {
        lastUrgentIds.current.clear();
        lastUrgentStates.current.clear();
        return;
      }

      // Check if any issue state changed since last check
      let anyChanged = false;
      for (const issue of issues) {
        const prevState = lastUrgentStates.current.get(issue.id);
        if (prevState !== undefined && prevState !== issue.state?.name) {
          anyChanged = true;
        }
        lastUrgentStates.current.set(issue.id, issue.state?.name ?? "");
      }

      // First load: populate but don't alarm
      if (lastUrgentIds.current.size === 0) {
        issues.forEach((i) => lastUrgentIds.current.add(i.id));
        return;
      }

      // If no state changes since last alarm, fire recurring alarm
      if (!anyChanged) {
        const names = issues.slice(0, 3).map((i) => i.name).join(", ");
        showNotification(
          `⚠️ ${issues.length} chamado${issues.length > 1 ? "s" : ""} URGENTE${issues.length > 1 ? "S" : ""} sem resolução`,
          names + (issues.length > 3 ? ` e mais ${issues.length - 3}…` : ""),
          "urgent-alarm"
        );
      }
    };

    // Run first check after a small delay, then repeat
    const timeout = setTimeout(() => {
      checkUrgent();
      const interval = setInterval(checkUrgent, urgentAlarmIntervalMs);
      return () => clearInterval(interval);
    }, 5_000);

    return () => { active = false; clearTimeout(timeout); };
  }, [workspaceSlug, urgentAlarmIntervalMs]);

  const notify = useCallback((title: string, body: string, tag?: string) => {
    showNotification(title, body, tag);
  }, []);

  return { notify, requestPermission };
}
