import React from "react";
import { Pressable, View } from "react-native";

import { TechnicalVisit } from "@/api";
import { isLocalId, shortDate } from "@/utils/format";
import { useTheme } from "@/theme";
import { SyncBadge } from "./badges";
import { Row, Text } from "./ui";

const MOTIVATIONS: { key: keyof TechnicalVisit; label: string }[] = [
  { key: "mot_update", label: "Atualização" },
  { key: "mot_bug_fix", label: "Correção" },
  { key: "mot_training", label: "Treinamento" },
  { key: "mot_improvement", label: "Melhoria" },
  { key: "mot_commercial", label: "Comercial" },
  { key: "mot_other", label: "Outros" },
];

export function VisitRow({ visit, onPress }: { visit: TechnicalVisit; onPress?: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const pending = isLocalId(visit.id);
  const tags = MOTIVATIONS.filter((m) => Boolean(visit[m.key]));
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: pending ? colors.pending : colors.border,
        padding: spacing.md,
        gap: 6,
      })}
    >
      <Row align="space-between">
        <Text weight="bold">{visit.visit_number ? `Visita #${visit.visit_number}` : "Visita técnica"}</Text>
        {pending ? <SyncBadge compact /> : <Text variant="tertiary">{shortDate(visit.scheduled_date)}</Text>}
      </Row>
      {visit.city ? <Text variant="secondary">{visit.city}</Text> : null}
      {tags.length ? (
        <Row gap={6} style={{ flexWrap: "wrap" }}>
          {tags.map((t) => (
            <View key={String(t.key)} style={{ backgroundColor: colors.primaryMuted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text variant="tertiary" color={colors.primary}>{t.label}</Text>
            </View>
          ))}
        </Row>
      ) : null}
    </Pressable>
  );
}
