/**
 * Small status pills: priority, state group, legacy ticket number, role and the
 * all-important "pending sync" badge.
 */
import React from "react";
import { View } from "react-native";

import { Priority, StateGroup } from "@/api";
import { roleLabel } from "@/permissions/roles";
import { priorityColors, stateGroupColors, useTheme } from "@/theme";
import { Text } from "./ui";

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  const { radius } = useTheme();
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text variant="tertiary" color={color} weight="bold" style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
}

function withAlpha(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

export function PriorityBadge({ priority }: { priority?: Priority | null }) {
  if (!priority || priority === "none") return null;
  const color = priorityColors[priority];
  return <Pill label={priority} color={color} bg={withAlpha(color, "22")} />;
}

export function StateBadge({ name, group }: { name: string; group?: StateGroup }) {
  const { colors, radius } = useTheme();
  const dot = group ? stateGroupColors[group] : colors.textTertiary;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSunken, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text variant="caption">{name}</Text>
    </View>
  );
}

export function LegacyTicketBadge({ number }: { number?: string | null }) {
  const { mode } = useTheme();
  if (!number) return null;
  return (
    <Pill
      label={`#${number}`}
      color={mode === "dark" ? "#FCD34D" : "#92400E"}
      bg={mode === "dark" ? "#3A2E0B" : "#FEF3C7"}
    />
  );
}

export function RoleBadge({ role }: { role?: number | null }) {
  const { colors } = useTheme();
  if (role == null) return null;
  return <Pill label={roleLabel(role)} color={colors.primary} bg={colors.primaryMuted} />;
}

/**
 * Pending-sync indicator. Rendered next to any record created offline that has
 * not yet been replayed to the server. Deliberately high-contrast.
 */
export function SyncBadge({ compact }: { compact?: boolean }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: colors.pendingBg,
        borderRadius: radius.pill,
        paddingHorizontal: compact ? 6 : 9,
        paddingVertical: compact ? 2 : 3,
      }}
    >
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pending }} />
      {!compact && (
        <Text variant="tertiary" color={colors.pending} weight="bold" style={{ textTransform: "uppercase", letterSpacing: 0.4 }}>
          Pendente de sync
        </Text>
      )}
    </View>
  );
}
