import { useRouter } from "expo-router";
import { FileText, Inbox, LayoutGrid, LucideIcon, Plane, Search } from "lucide-react-native";
import React, { useMemo } from "react";
import { Pressable, RefreshControl, View } from "react-native";

import { DashboardIssue, endpoints } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Card, LegacyTicketBadge, Loading, Logo, PriorityBadge, Row, Screen, StateBadge, SyncBadge, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useSync } from "@/offline/SyncProvider";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";
import { displayName } from "@/utils/format";

function StatCard({ label, value, tone, onPress }: { label: string; value: number; tone?: "danger" | "default"; onPress?: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const color = tone === "danger" ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        backgroundColor: pressed ? colors.surfaceSunken : colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: tone === "danger" && value > 0 ? colors.danger : colors.border,
        padding: spacing.md,
        gap: 2,
        minWidth: "30%",
      })}
    >
      <Text style={{ fontSize: 26 }} color={color} weight="bold">{value}</Text>
      <Text variant="tertiary">{label}</Text>
    </Pressable>
  );
}

function QuickAction({ icon: Icon, label, onPress }: { icon: LucideIcon; label: string; onPress: () => void }) {
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
      <Icon size={24} color={colors.primary} />
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
  const slug = activeWorkspace?.slug;

  const dash = useAsync(() => (slug ? endpoints.users.dashboard(slug) : Promise.resolve({ issues: [] })), [slug]);

  const issues: DashboardIssue[] = dash.data?.issues ?? [];
  const urgent = useMemo(() => issues.filter((i) => i.priority === "urgent"), [issues]);
  const openCount = useMemo(
    () => issues.filter((i) => i.state?.group !== "completed" && i.state?.group !== "cancelled").length,
    [issues],
  );

  const openWorkItem = (i: DashboardIssue) => router.push(`/work-item/${i.id}?projectId=${i.projectId}`);

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={dash.loading} onRefresh={dash.refetch} tintColor={colors.primary} />}>
      <Row align="space-between">
        <Logo size="md" />
        <Text variant="secondary">{activeWorkspace?.name ?? "—"}</Text>
      </Row>

      <View>
        <Text variant="title">Olá, {displayName(me).split(" ")[0]}</Text>
        <Text variant="secondary">Seu papel: {label}</Text>
      </View>

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
                    : "Alterações novas serão sincronizadas quando a conexão voltar."}
                </Text>
              </View>
              {pendingCount > 0 ? <SyncBadge compact /> : null}
            </Row>
          </Card>
        </Pressable>
      )}

      <Pressable onPress={() => router.push("/search")}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Search size={18} color={colors.textSecondary} />
          <Text variant="secondary">Buscar work items, intakes, chamados…</Text>
        </Card>
      </Pressable>

      {/* Useful stats from my dashboard */}
      <Text variant="heading">Meus chamados</Text>
      {dash.loading && !dash.data ? (
        <Loading />
      ) : (
        <Row gap={spacing.sm} style={{ flexWrap: "wrap" }}>
          <StatCard label="Atribuídos" value={issues.length} />
          <StatCard label="Em aberto" value={openCount} />
          <StatCard label="Urgentes" value={urgent.length} tone="danger" />
        </Row>
      )}

      {/* Urgent section */}
      {urgent.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Row gap={6}>
            <Text variant="heading" color={colors.danger}>Urgentes</Text>
            <PriorityBadge priority="urgent" />
          </Row>
          {urgent.slice(0, 5).map((i) => (
            <Pressable key={i.id} onPress={() => openWorkItem(i)}>
              <Card style={{ borderColor: colors.danger, gap: 6 }}>
                <Row gap={6} style={{ flexWrap: "wrap" }}>
                  <LegacyTicketBadge number={i.legacyTicketNumber} />
                  {i.state ? <StateBadge name={i.state.name} group={i.state.group} /> : null}
                </Row>
                <Text numberOfLines={2}>{i.name}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent assigned */}
      {issues.length > 0 && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="heading">Atribuídos a mim</Text>
          {issues.slice(0, 6).map((i) => (
            <Pressable key={i.id} onPress={() => openWorkItem(i)}>
              <Card style={{ gap: 6 }}>
                <Row gap={6} style={{ flexWrap: "wrap" }}>
                  <LegacyTicketBadge number={i.legacyTicketNumber} />
                  <PriorityBadge priority={i.priority} />
                  {i.state ? <StateBadge name={i.state.name} group={i.state.group} /> : null}
                </Row>
                <Text numberOfLines={1}>{i.name}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      <Text variant="heading" style={{ marginTop: spacing.sm }}>Acesso rápido</Text>
      <Row gap={spacing.md} style={{ flexWrap: "wrap" }}>
        <QuickAction icon={LayoutGrid} label="Chamados" onPress={() => router.push("/(tabs)/work-items")} />
        <QuickAction icon={Inbox} label="Solicitações" onPress={() => router.push("/(tabs)/intake")} />
        <QuickAction icon={Plane} label="Visitas" onPress={() => router.push("/(tabs)/visits")} />
        <QuickAction icon={FileText} label="Wiki" onPress={() => router.push("/wiki")} />
      </Row>

      {syncing ? <Text variant="tertiary">Sincronizando…</Text> : null}
    </Screen>
  );
}
