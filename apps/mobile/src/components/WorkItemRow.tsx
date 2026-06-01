/**
 * Reusable list row for work items / intake items / search hits. Shows the
 * legacy ticket badge, priority, name, state and a pending-sync marker.
 */
import React from "react";
import { Pressable, View } from "react-native";

import { Priority, StateGroup } from "@/api";
import { isLocalId } from "@/utils/format";
import { useTheme } from "@/theme";
import { LegacyTicketBadge, PriorityBadge, StateBadge, SyncBadge } from "./badges";
import { Row, Text } from "./ui";

export type WorkItemRowData = {
  id: string;
  name: string;
  priority?: Priority | null;
  legacy_ticket_number?: string | null;
  sequence_id?: number | null;
  state?: { name: string; group?: StateGroup } | null;
  projectIdentifier?: string | null;
};

export function WorkItemRow({ item, onPress }: { item: WorkItemRowData; onPress?: () => void }) {
  const { colors, spacing, radius } = useTheme();
  const pending = isLocalId(item.id);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: pending ? colors.pending : colors.border,
        padding: spacing.md,
        gap: spacing.sm,
      })}
    >
      <Row gap={6} style={{ flexWrap: "wrap" }}>
        <LegacyTicketBadge number={item.legacy_ticket_number} />
        <PriorityBadge priority={item.priority} />
        {item.projectIdentifier && item.sequence_id != null ? (
          <Text variant="tertiary">
            {item.projectIdentifier}-{item.sequence_id}
          </Text>
        ) : null}
        {pending ? <SyncBadge compact /> : null}
      </Row>
      <Text numberOfLines={2}>{item.name}</Text>
      <Row align="space-between">
        {item.state ? <StateBadge name={item.state.name} group={item.state.group} /> : <View />}
        {pending ? <SyncBadge /> : null}
      </Row>
    </Pressable>
  );
}
