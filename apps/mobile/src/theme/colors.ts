/**
 * Design tokens for Avião. Two palettes (light / dark) sharing the same shape so
 * components can read `theme.colors.X` without caring which mode is active.
 *
 * Priority colors mirror the API values: urgent | high | medium | low | none.
 * State-group colors mirror Plane's groups: backlog | unstarted | started |
 * completed | cancelled | triage.
 */

export type ColorScheme = {
  // surfaces
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSunken: string;
  // borders / dividers
  border: string;
  borderStrong: string;
  // text
  text: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;
  // brand / accents
  primary: string;
  primaryMuted: string;
  onPrimary: string;
  // status
  success: string;
  warning: string;
  danger: string;
  info: string;
  // sync indicator
  pending: string;
  pendingBg: string;
  // misc
  overlay: string;
  shadow: string;
};

export const priorityColors = {
  urgent: "#DC2626",
  high: "#EA580C",
  medium: "#D97706",
  low: "#2563EB",
  none: "#6B7280",
} as const;

export const stateGroupColors = {
  backlog: "#94A3B8",
  unstarted: "#64748B",
  started: "#3B82F6",
  completed: "#16A34A",
  cancelled: "#DC2626",
  triage: "#6366F1",
} as const;

export const lightColors: ColorScheme = {
  background: "#F8FAFC",
  surface: "#FFFFFF",
  surfaceElevated: "#FFFFFF",
  surfaceSunken: "#F1F5F9",
  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  text: "#0F172A",
  textSecondary: "#475569",
  textTertiary: "#94A3B8",
  textInverse: "#F8FAFC",
  primary: "#2563EB",
  primaryMuted: "#DBEAFE",
  onPrimary: "#FFFFFF",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  info: "#0EA5E9",
  pending: "#B45309",
  pendingBg: "#FEF3C7",
  overlay: "rgba(15,23,42,0.45)",
  shadow: "#0F172A",
};

export const darkColors: ColorScheme = {
  background: "#0B1220",
  surface: "#111A2E",
  surfaceElevated: "#16223C",
  surfaceSunken: "#0A1019",
  border: "#1E2A44",
  borderStrong: "#2B3A5C",
  text: "#E8EEF9",
  textSecondary: "#9FB0CC",
  textTertiary: "#647396",
  textInverse: "#0B1220",
  primary: "#3B82F6",
  primaryMuted: "#1E3A8A",
  onPrimary: "#FFFFFF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#38BDF8",
  pending: "#FBBF24",
  pendingBg: "#3A2E0B",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "#000000",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 } as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
} as const;
