import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, RefreshControl } from "react-native";

import { endpoints, State, WorkItem } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, LegacyTicketBadge, Loading, PriorityBadge, RichTextViewer, Row, Screen, StateBadge, Text } from "@/components";
import { OptionSheet } from "@/components/Sheet";
import { useAsync } from "@/hooks/useAsync";
import { usePermissions } from "@/permissions/usePermissions";
import { stateGroupColors, useTheme } from "@/theme";
import { View } from "react-native";

export default function IntakeDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { can } = usePermissions(projectId);
  const { colors } = useTheme();

  const item = useAsync<WorkItem | null>(
    () => (slug && projectId && id ? endpoints.intake.get(slug, projectId, id) : Promise.resolve(null)),
    [slug, projectId, id],
  );
  const states = useAsync<State[]>(() => (slug && projectId ? endpoints.projects.states(slug, projectId) : Promise.resolve([])), [slug, projectId]);
  const [sheet, setSheet] = useState(false);

  const accept = useCallback(
    async (stateId: string) => {
      if (!slug || !projectId || !id) return;
      try {
        // Moving out of triage promotes the intake item to a work item.
        await endpoints.intake.update(slug, projectId, id, { state_id: stateId });
        item.refetch();
      } catch {
        Alert.alert("Erro", "Não foi possível atualizar o intake.");
      }
    },
    [slug, projectId, id, item],
  );

  if (item.loading && !item.data) return <Loading />;
  const wi = item.data;
  if (!wi) return <Screen><Text>Item não encontrado.</Text></Screen>;

  const nonTriage = (states.data ?? []).filter((s) => s.group !== "triage");

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={item.loading} onRefresh={item.refetch} tintColor={colors.primary} />}>
      <Row gap={6} style={{ flexWrap: "wrap" }}>
        <LegacyTicketBadge number={wi.legacy_ticket_number} />
        <PriorityBadge priority={wi.priority} />
        <StateBadge name="Triagem" group="triage" />
      </Row>
      <Text variant="title">{wi.name}</Text>

      <Text variant="heading">Descrição</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextViewer html={wi.description_html ?? ""} minHeight={120} />
      </Card>

      {can("createWorkItem") && (
        <Button title="Aceitar e mover para…" onPress={() => setSheet(true)} />
      )}

      <OptionSheet
        visible={sheet}
        title="Mover intake para"
        onSelect={(v) => accept(String(v))}
        onClose={() => setSheet(false)}
        options={nonTriage.map((s) => ({
          value: s.id,
          label: s.name,
          accessory: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stateGroupColors[s.group] ?? colors.textTertiary }} />,
        }))}
      />
    </Screen>
  );
}
