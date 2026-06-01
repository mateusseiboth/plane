import { FlashList } from "@shopify/flash-list";
import React, { useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";

import { Entity, endpoints } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Card, EmptyState, Input, Loading, Row, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useTheme } from "@/theme";

const ENTITY_TYPES: Record<number, string> = {
  0: "Prefeitura",
  1: "Câmara",
  2: "Outros",
  3: "Escola",
  4: "Autarquia",
  5: "RPPS",
  6: "SAAE",
  7: "Consórcio",
};

export default function EntitiesScreen() {
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { colors, spacing } = useTheme();
  const [q, setQ] = useState("");

  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);

  const filtered = useMemo(() => {
    const list = entities.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((e) => [e.name, e.city, e.cnpj].some((v) => (v ?? "").toLowerCase().includes(term)));
  }, [entities.data, q]);

  if (entities.loading && !entities.data) return <Loading />;

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg }}>
        <Input value={q} onChangeText={setQ} placeholder="Buscar entidade, cidade, CNPJ…" autoCapitalize="none" />
      </View>
      <FlashList
        data={filtered}
        estimatedItemSize={84}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={<RefreshControl refreshing={entities.loading} onRefresh={entities.refetch} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState title="Nenhuma entidade" description="Nenhuma entidade encontrada." />}
        renderItem={({ item }) => (
          <Card style={{ gap: 4 }}>
            <Row align="space-between">
              <Text weight="medium" style={{ flex: 1 }} numberOfLines={1}>{item.name}</Text>
              {item.entity_type != null ? (
                <View style={{ backgroundColor: colors.primaryMuted, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text variant="tertiary" color={colors.primary}>{ENTITY_TYPES[item.entity_type] ?? "—"}</Text>
                </View>
              ) : null}
            </Row>
            <Text variant="tertiary">
              {[item.city, item.state].filter(Boolean).join(" / ") || "—"}
              {item.cnpj ? ` • ${item.cnpj}` : ""}
            </Text>
          </Card>
        )}
      />
    </Screen>
  );
}
