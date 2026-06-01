import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { endpoints } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Divider, Logo, Row, Screen, SyncBadge, Text } from "@/components";
import { OptionSheet } from "@/components/Sheet";
import { useSync } from "@/offline/SyncProvider";
import { usePermissions } from "@/permissions/usePermissions";
import { ThemeMode, useTheme } from "@/theme";
import { displayName } from "@/utils/format";

function NavRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingVertical: spacing.md, backgroundColor: pressed ? colors.surfaceSunken : "transparent" })}>
      <Row align="space-between">
        <Row gap={spacing.sm}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
          <Text>{label}</Text>
        </Row>
        <Text variant="tertiary">›</Text>
      </Row>
    </Pressable>
  );
}

export default function MoreScreen() {
  const router = useRouter();
  const { me, activeWorkspace, workspaces, setActiveWorkspace, signOut } = useAuth();
  const { preference, setPreference, colors, spacing } = useTheme();
  const { online, pendingCount, syncing, syncNow } = useSync();
  const { isAdmin, can, label } = usePermissions();
  const [wsSheet, setWsSheet] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  const themeOptions: { value: ThemeMode; label: string }[] = [
    { value: "light", label: "Claro" },
    { value: "dark", label: "Escuro" },
    { value: "system", label: "Sistema" },
  ];

  const reindex = async () => {
    if (!activeWorkspace) return;
    setReindexing(true);
    try {
      await endpoints.search.reindex(activeWorkspace.slug);
      Alert.alert("Pronto", "Índices de busca atualizados.");
    } catch {
      Alert.alert("Erro", "Não foi possível reindexar.");
    } finally {
      setReindexing(false);
    }
  };

  return (
    <Screen scroll>
      <Logo size="md" />

      <Card>
        <Text weight="bold">{displayName(me)}</Text>
        <Text variant="secondary">{me?.email}</Text>
        <Row gap={6} style={{ marginTop: 4 }}>
          <Text variant="tertiary">Papel: {label}</Text>
        </Row>
      </Card>

      <Text variant="heading">Workspace</Text>
      <Pressable onPress={() => setWsSheet(true)}>
        <Card>
          <Row align="space-between">
            <Text weight="medium">{activeWorkspace?.name ?? "—"}</Text>
            <Text variant="tertiary">trocar ›</Text>
          </Row>
        </Card>
      </Pressable>

      <Text variant="heading">Navegação</Text>
      <Card style={{ paddingVertical: 0 }}>
        <NavRow icon="🔍" label="Buscar" onPress={() => router.push("/search")} />
        <Divider />
        <NavRow icon="🔔" label="Notificações" onPress={() => router.push("/notifications")} />
        <Divider />
        <NavRow icon="🏢" label="Entidades" onPress={() => router.push("/entities")} />
        <Divider />
        <NavRow icon="📄" label="Wiki" onPress={() => router.push("/wiki")} />
      </Card>

      <Text variant="heading">Sincronização</Text>
      <Card>
        <Row align="space-between">
          <Text variant="secondary">Status</Text>
          <Text weight="medium" color={online ? colors.success : colors.pending}>{online ? "Online" : "Offline"}</Text>
        </Row>
        <Divider />
        <Row align="space-between">
          <Text variant="secondary">Pendentes</Text>
          {pendingCount > 0 ? <SyncBadge compact /> : <Text>0</Text>}
        </Row>
        {pendingCount > 0 ? <Button title={syncing ? "Sincronizando…" : "Sincronizar agora"} variant="secondary" onPress={syncNow} loading={syncing} /> : null}
      </Card>

      <Text variant="heading">Aparência</Text>
      <Row gap={spacing.sm}>
        {themeOptions.map((o) => {
          const active = preference === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => setPreference(o.value)}
              style={{ flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primaryMuted : colors.surface }}
            >
              <Text color={active ? colors.primary : colors.textSecondary} weight="medium">{o.label}</Text>
            </Pressable>
          );
        })}
      </Row>

      {isAdmin && can("reindexSearch") ? (
        <>
          <Text variant="heading">Administração</Text>
          <Button title="Reindexar busca" variant="secondary" onPress={reindex} loading={reindexing} />
        </>
      ) : null}

      <View style={{ height: spacing.lg }} />
      <Button title="Sair" variant="danger" onPress={signOut} />

      <OptionSheet
        visible={wsSheet}
        title="Trocar workspace"
        selected={activeWorkspace?.slug}
        onSelect={(v) => setActiveWorkspace(String(v))}
        onClose={() => setWsSheet(false)}
        options={workspaces.map((w) => ({ value: w.slug, label: w.name, description: w.slug }))}
      />
    </Screen>
  );
}
