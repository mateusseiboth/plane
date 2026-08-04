import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import React from "react";
import { RefreshControl, View } from "react-native";

import { endpoints, WorkItem } from "@/api";
import { EmptyState, Fab, Loading, ProjectPicker, Screen, WorkItemRow } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";

export default function IntakeScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { slug, projects, current, setCurrent } = useCurrentProject();
  const { can } = usePermissions(current?.id);

  const items = useAsync<WorkItem[]>(
    async () => {
      if (!slug || !current) return [];
      const res = await endpoints.intake.list(slug, current.id, { per_page: 100 });
      return res.results ?? [];
    },
    [slug, current?.id],
  );

  if (!current) {
    return (
      <Screen>
        {projects.length === 0 ? <Loading label="Carregando…" /> : <ProjectPicker projects={projects} current={current} onSelect={setCurrent} />}
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg }}>
        <ProjectPicker projects={projects} current={current} onSelect={setCurrent} />
      </View>
      {items.loading && !items.data ? (
        <Loading />
      ) : (
        <FlashList
          data={items.data ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={items.loading} onRefresh={items.refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState title="Nenhuma solicitação" description="Nenhuma solicitação aguardando triagem." />}
          renderItem={({ item }) => (
            <WorkItemRow
              item={{
                id: item.id,
                name: item.name,
                priority: item.priority,
                legacy_ticket_number: item.legacy_ticket_number,
                sequence_id: item.sequence_id,
                projectIdentifier: current.identifier,
                state: { name: "Triagem", group: "triage" },
              }}
              onPress={() => router.push(`/intake/${item.id}?projectId=${current.id}`)}
            />
          )}
        />
      )}

      {can("createIntake") && (
        <Fab onPress={() => router.push(`/intake/new?projectId=${current.id}`)}>
          <Plus size={26} color={colors.onPrimary} />
        </Fab>
      )}
    </Screen>
  );
}
