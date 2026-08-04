import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, RefreshControl } from "react-native";

import { endpoints, WorkItem } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, LegacyTicketBadge, Loading, PriorityBadge, RichTextViewer, Row, Screen, StateBadge, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";

export default function IntakeDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { can } = usePermissions(projectId);
  const { colors, spacing } = useTheme();

  const item = useAsync<WorkItem | null>(
    () => (slug && projectId && id ? endpoints.intake.get(slug, projectId, id) : Promise.resolve(null)),
    [slug, projectId, id],
  );
  const [working, setWorking] = useState(false);

  const decide = useCallback(
    async (status: 1 | -1) => {
      if (!slug || !projectId || !id) return;
      setWorking(true);
      try {
        await endpoints.intake.setStatus(slug, projectId, id, status);
        Alert.alert(status === 1 ? "Aprovado" : "Recusado", status === 1 ? "Chamado movido para o fluxo de trabalho." : "Solicitação recusada.");
        router.back();
      } catch {
        Alert.alert("Erro", "Não foi possível atualizar o intake.");
      } finally {
        setWorking(false);
      }
    },
    [slug, projectId, id, router],
  );

  if (item.loading && !item.data) return <Loading />;
  const wi = item.data;
  if (!wi) return <Screen><Text>Item não encontrado.</Text></Screen>;

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

      {can("createWorkItem") ? (
        <Row gap={spacing.md}>
          <Button title="Recusar" variant="danger" onPress={() => decide(-1)} loading={working} style={{ flex: 1 }} />
          <Button title="Aprovar" onPress={() => decide(1)} loading={working} style={{ flex: 1 }} />
        </Row>
      ) : (
        <Text variant="tertiary">Aguardando triagem por um revisor.</Text>
      )}
    </Screen>
  );
}
