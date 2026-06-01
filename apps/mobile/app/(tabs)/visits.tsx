import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";

import { endpoints, TechnicalVisit } from "@/api";
import { EmptyState, Fab, Loading, MonthCalendar, Row, Screen, Text, VisitRow } from "@/components";
import { useAuth } from "@/auth/AuthContext";
import { useAsync } from "@/hooks/useAsync";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";
import { shortDate, toDate } from "@/utils/format";

export default function VisitsScreen() {
  const router = useRouter();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { can } = usePermissions();
  const { colors, spacing } = useTheme();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const visits = useAsync<TechnicalVisit[]>(() => (slug ? endpoints.visits.list(slug) : Promise.resolve([])), [slug]);

  const eventDates = useMemo(
    () => (visits.data ?? []).map((v) => toDate(v.scheduled_date)).filter(Boolean) as Date[],
    [visits.data],
  );

  const visibleVisits = useMemo(() => {
    const list = visits.data ?? [];
    if (view === "calendar" && selectedDay) {
      return list.filter((v) => {
        const d = toDate(v.scheduled_date);
        return d && d.toDateString() === selectedDay.toDateString();
      });
    }
    return list;
  }, [visits.data, view, selectedDay]);

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <Row gap={spacing.sm}>
          {(["list", "calendar"] as const).map((v) => {
            const active = v === view;
            return (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: spacing.sm,
                  borderRadius: 8,
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text color={active ? colors.onPrimary : colors.textSecondary} weight="medium">
                  {v === "list" ? "Lista" : "Calendário"}
                </Text>
              </Pressable>
            );
          })}
        </Row>
        {view === "calendar" && (
          <MonthCalendar eventDates={eventDates} selected={selectedDay} onSelect={setSelectedDay} />
        )}
      </View>

      {visits.loading && !visits.data ? (
        <Loading />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={visits.loading} onRefresh={visits.refetch} tintColor={colors.primary} />}
        >
          {view === "calendar" && selectedDay ? (
            <Text variant="caption" style={{ marginBottom: spacing.xs }}>Visitas em {shortDate(selectedDay.toISOString())}</Text>
          ) : null}
          {visibleVisits.length === 0 ? (
            <EmptyState title="Sem visitas" description="Nenhuma visita técnica encontrada." />
          ) : (
            visibleVisits.map((v) => (
              <VisitRow key={v.id} visit={v} onPress={() => router.push(`/visit/${v.id}`)} />
            ))
          )}
        </ScrollView>
      )}

      {can("manageVisits") && (
        <Fab onPress={() => router.push("/visit/new")}>
          <Text style={{ fontSize: 26, color: colors.onPrimary }}>＋</Text>
        </Fab>
      )}
    </Screen>
  );
}
