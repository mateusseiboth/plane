import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";

import { endpoints, State, WorkItem } from "@/api";
import { EmptyState, Fab, Loading, ProjectPicker, Row, Screen, Text, WorkItemRow } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useCurrentProject } from "@/hooks/useCurrentProject";
import { usePermissions } from "@/permissions/usePermissions";
import { stateGroupColors, useTheme } from "@/theme";
import { Pressable } from "react-native";

const GROUPS: { key: string; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "triage", label: "Triagem" },
  { key: "backlog", label: "Backlog" },
  { key: "started", label: "Em progresso" },
  { key: "completed", label: "Concluídos" },
];

export default function WorkItemsScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const { slug, projects, current, setCurrent } = useCurrentProject();
  const { can } = usePermissions(current?.id);
  const [group, setGroup] = useState("all");

  const states = useAsync<State[]>(
    () => (slug && current ? endpoints.projects.states(slug, current.id) : Promise.resolve([])),
    [slug, current?.id],
  );
  const items = useAsync<WorkItem[]>(
    async () => {
      if (!slug || !current) return [];
      const res = await endpoints.issues.list(slug, current.id, { per_page: 100 });
      return res.results ?? [];
    },
    [slug, current?.id],
  );

  const stateById = useMemo(() => {
    const m = new Map<string, State>();
    (states.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [states.data]);

  const filtered = useMemo(() => {
    const list = items.data ?? [];
    if (group === "all") return list;
    return list.filter((i) => {
      const st = i.state_id ? stateById.get(i.state_id) : undefined;
      return st?.group === group;
    });
  }, [items.data, group, stateById]);

  if (!current) {
    return (
      <Screen>
        {projects.length === 0 ? <Loading label="Carregando projetos…" /> : (
          <ProjectPicker projects={projects} current={current} onSelect={setCurrent} />
        )}
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <ProjectPicker projects={projects} current={current} onSelect={setCurrent} />
        <Row gap={spacing.sm} style={{ flexWrap: "wrap" }}>
          {GROUPS.map((g) => {
            const active = g.key === group;
            return (
              <Pressable
                key={g.key}
                onPress={() => setGroup(g.key)}
                style={{
                  paddingHorizontal: spacing.md,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text variant="caption" color={active ? colors.onPrimary : colors.textSecondary}>
                  {g.label}
                </Text>
              </Pressable>
            );
          })}
        </Row>
      </View>

      {items.loading && !items.data ? (
        <Loading />
      ) : (
        <FlashList
          data={filtered}
          estimatedItemSize={96}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={items.loading} onRefresh={items.refetch} tintColor={colors.primary} />}
          ListEmptyComponent={<EmptyState title="Nenhum work item" description="Crie o primeiro work item deste projeto." />}
          renderItem={({ item }) => {
            const st = item.state_id ? stateById.get(item.state_id) : undefined;
            return (
              <WorkItemRow
                item={{
                  id: item.id,
                  name: item.name,
                  priority: item.priority,
                  legacy_ticket_number: item.legacy_ticket_number,
                  sequence_id: item.sequence_id,
                  projectIdentifier: current.identifier,
                  state: st ? { name: st.name, group: st.group } : null,
                }}
                onPress={() => router.push(`/work-item/${item.id}?projectId=${current.id}`)}
              />
            );
          }}
        />
      )}

      {can("createWorkItem") && (
        <Fab onPress={() => router.push(`/work-item/new?projectId=${current.id}`)}>
          <Text style={{ fontSize: 26, color: colors.onPrimary }}>＋</Text>
        </Fab>
      )}
    </Screen>
  );
}
