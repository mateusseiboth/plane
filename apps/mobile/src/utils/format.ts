import { format, formatDistanceToNow, isValid, parseISO } from "date-fns";

export function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseISO(value) : new Date(value);
  return isValid(d) ? d : null;
}

export function shortDate(value?: string | null): string {
  const d = toDate(value);
  return d ? format(d, "dd/MM/yyyy") : "—";
}

export function dateTime(value?: string | null): string {
  const d = toDate(value);
  return d ? format(d, "dd/MM/yyyy HH:mm") : "—";
}

export function relative(value?: string | null): string {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : "—";
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function isLocalId(id?: string | null): boolean {
  return !!id && id.startsWith("local:");
}

export function displayName(m?: {
  display_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
}): string {
  if (!m) return "—";
  return m.display_name || [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "—";
}
