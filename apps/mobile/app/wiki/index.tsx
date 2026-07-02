import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { Lock } from "lucide-react-native";
import React from "react";
import { Pressable, RefreshControl, View } from "react-native";

import { endpoints, WikiPage } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Card, EmptyState, Loading, Row, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useTheme } from "@/theme";
import { relative } from "@/utils/format";

export default function WikiScreen() {
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { colors, spacing } = useTheme();

  const pages = useAsync<WikiPage[]>(() => (slug ? endpoints.pages.list(slug) : Promise.resolve([])), [slug]);

  if (pages.loading && !pages.data) return <Loading />;

  return (
    <Screen padded={false}>
      <FlashList
        data={pages.data ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={<RefreshControl refreshing={pages.loading} onRefresh={pages.refetch} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState title="Wiki vazia" description="Nenhuma página encontrada." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/wiki/${item.id}`)}>
            <Card>
              <Row align="space-between">
                <Text weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name || "Sem título"}
                </Text>
                {item.is_locked ? <Lock size={14} color={colors.textTertiary} /> : null}
              </Row>
              <Text variant="tertiary">Atualizada {relative(item.updated_at)}</Text>
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}
