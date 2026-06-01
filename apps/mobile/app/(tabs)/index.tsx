import { useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { Card, Logo, Row, Screen, SyncBadge, Text } from "@/components";
import { useSync } from "@/offline/SyncProvider";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";
import { displayName } from "@/utils/format";

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.sm,
        minWidth: "44%",
      })}
    >
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text weight="medium">{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { me, activeWorkspace } = useAuth();
  const { online, pendingCount, syncing, syncNow } = useSync();
  const { label } = usePermissions();
  const { colors, spacing } = useTheme();

  return (
    <Screen scroll>
      <Row align="space-between">
        <Logo size="md" />
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="secondary">{activeWorkspace?.name ?? "—"}</Text>
        </View>
      </Row>

      <Text variant="title">Olá, {displayName(me).split(" ")[0]}</Text>
      <Row gap={6}>
        <Text variant="secondary">Seu papel:</Text>
        <Text variant="secondary" weight="bold">{label}</Text>
      </Row>

      {(!online || pendingCount > 0) && (
        <Pressable onPress={syncNow}>
          <Card style={{ borderColor: colors.pending, backgroundColor: colors.pendingBg }}>
            <Row align="space-between">
              <View style={{ flex: 1 }}>
                <Text weight="bold" color={colors.pending}>
                  {online ? "Itens pendentes de sincronização" : "Você está offline"}
                </Text>
                <Text variant="secondary">
                  {pendingCount > 0
                    ? `${pendingCount} item(ns) aguardando envio${online ? " — toque para sincronizar" : ""}.`
                    : "As alterações novas serão sincronizadas quando a conexão voltar."}
                </Text>
              </View>
              {pendingCount > 0 ? <SyncBadge compact /> : null}
            </Row>
          </Card>
        </Pressable>
      )}

      <Pressable onPress={() => router.push("/search")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={{ fontSize: 18 }}>🔍</Text>
          <Text variant="secondary">Buscar work items, intakes, chamados…</Text>
        </Card>
      </Pressable>

      <Text variant="heading" style={{ marginTop: spacing.sm }}>Acesso rápido</Text>
      <Row gap={spacing.md} style={{ flexWrap: "wrap" }}>
        <QuickAction icon="◫" label="Work Items" onPress={() => router.push("/(tabs)/work-items")} />
        <QuickAction icon="✉" label="Intake" onPress={() => router.push("/(tabs)/intake")} />
        <QuickAction icon="✈" label="Visitas" onPress={() => router.push("/(tabs)/visits")} />
        <QuickAction icon="📄" label="Wiki" onPress={() => router.push("/wiki")} />
      </Row>

      {syncing ? <Text variant="tertiary">Sincronizando…</Text> : null}
    </Screen>
  );
}
