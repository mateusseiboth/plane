import { FlashList } from "@shopify/flash-list";
import React from "react";
import { RefreshControl, View } from "react-native";

import { AppNotification, endpoints, Paginated } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, EmptyState, Loading, Row, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useTheme } from "@/theme";
import { relative } from "@/utils/format";

export default function NotificationsScreen() {
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { colors, spacing } = useTheme();

  const notifications = useAsync<AppNotification[]>(async () => {
    if (!slug) return [];
    const res = await endpoints.notifications.list(slug, { per_page: 50 });
    return Array.isArray(res) ? res : (res as Paginated<AppNotification>).results ?? [];
  }, [slug]);

  const markAll = async () => {
    if (!slug) return;
    await endpoints.notifications.markAllRead(slug).catch(() => {});
    notifications.refetch();
  };

  if (notifications.loading && !notifications.data) return <Loading />;

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg }}>
        <Button title="Marcar todas como lidas" variant="secondary" onPress={markAll} />
      </View>
      <FlashList
        data={notifications.data ?? []}
        estimatedItemSize={80}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={<RefreshControl refreshing={notifications.loading} onRefresh={notifications.refetch} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState title="Sem notificações" description="Você está em dia." />}
        renderItem={({ item }) => {
          const unread = !item.read_at;
          return (
            <Card style={{ borderColor: unread ? colors.primary : colors.border, gap: 4 }}>
              <Row align="space-between">
                <Text weight={unread ? "bold" : "regular"} style={{ flex: 1 }} numberOfLines={2}>
                  {item.title || "Notificação"}
                </Text>
                {unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} /> : null}
              </Row>
              {item.message ? <Text variant="secondary" numberOfLines={2}>{item.message}</Text> : null}
              <Text variant="tertiary">{relative(item.created_at)}</Text>
            </Card>
          );
        }}
      />
    </Screen>
  );
}
