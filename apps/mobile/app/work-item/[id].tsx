import { useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ChevronRight, Image as ImageIcon, Paperclip } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, RefreshControl, View } from "react-native";

import { Entity, endpoints, Member, Priority, State, WorkItem } from "@/api";
import {
  Card,
  Divider,
  LegacyTicketBadge,
  Loading,
  PriorityBadge,
  RichTextViewer,
  Row,
  Screen,
  StateBadge,
  Text,
} from "@/components";
import { OptionSheet, SheetOption } from "@/components/Sheet";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/auth/AuthContext";
import { usePermissions } from "@/permissions/usePermissions";
import { stateGroupColors, useTheme } from "@/theme";
import { displayName } from "@/utils/format";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

function ActionRow({ label, value, onPress, disabled }: { label: string; value: React.ReactNode; onPress?: () => void; disabled?: boolean }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={{ paddingVertical: spacing.md, opacity: disabled ? 0.5 : 1 }}>
      <Row align="space-between">
        <Text variant="secondary">{label}</Text>
        <Row gap={6}>
          {value}
          {!disabled ? <ChevronRight size={16} color={colors.textTertiary} /> : null}
        </Row>
      </Row>
    </Pressable>
  );
}

export default function WorkItemDetailScreen() {
  const { id, projectId } = useLocalSearchParams<{ id: string; projectId: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { can, isAdmin } = usePermissions(projectId);
  const { colors, spacing } = useTheme();

  const item = useAsync<WorkItem | null>(
    () => (slug && projectId && id ? endpoints.issues.get(slug, projectId, id) : Promise.resolve(null)),
    [slug, projectId, id],
  );
  const states = useAsync<State[]>(() => (slug && projectId ? endpoints.projects.states(slug, projectId) : Promise.resolve([])), [slug, projectId]);
  const members = useAsync<Member[]>(() => (slug && projectId ? endpoints.projects.members(slug, projectId) : Promise.resolve([])), [slug, projectId]);
  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);

  const [sheet, setSheet] = useState<null | "state" | "priority" | "entity" | "assignee">(null);
  const [saving, setSaving] = useState(false);

  const patch = useCallback(
    async (body: Partial<WorkItem>) => {
      if (!slug || !projectId || !id) return;
      setSaving(true);
      try {
        await endpoints.issues.update(slug, projectId, id, body);
        item.refetch();
      } catch (e) {
        Alert.alert("Erro", "Não foi possível salvar a alteração.");
      } finally {
        setSaving(false);
      }
    },
    [slug, projectId, id, item],
  );

  const upload = useCallback(
    async (uri: string, name: string, mime: string) => {
      if (!slug || !projectId || !id) return;
      const form = new FormData();
      // @ts-expect-error React Native FormData file shape
      form.append("asset", { uri, name, type: mime });
      try {
        await endpoints.issues.uploadAttachment(slug, projectId, id, form);
        Alert.alert("Pronto", "Arquivo anexado.");
      } catch {
        Alert.alert("Erro", "Falha ao enviar o arquivo.");
      }
    },
    [slug, projectId, id],
  );

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await upload(a.uri, a.fileName ?? "image.jpg", a.mimeType ?? "image/jpeg");
    }
  };
  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (!res.canceled && res.assets?.[0]) {
      const a = res.assets[0];
      await upload(a.uri, a.name, a.mimeType ?? "application/octet-stream");
    }
  };

  if (item.loading && !item.data) return <Loading />;
  const wi = item.data;
  if (!wi) return <Screen><Text>Work item não encontrado.</Text></Screen>;

  const currentState = states.data?.find((s) => s.id === wi.state_id);
  const currentEntity = entities.data?.find((e) => e.id === wi.entity_id);
  const assignees = (wi.assignee_ids ?? []).map((aid) => members.data?.find((m) => m.id === aid)).filter(Boolean) as Member[];

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={item.loading} onRefresh={item.refetch} tintColor={colors.primary} />}>
      <Row gap={6} style={{ flexWrap: "wrap" }}>
        <LegacyTicketBadge number={wi.legacy_ticket_number} />
        <PriorityBadge priority={wi.priority} />
        {currentState ? <StateBadge name={currentState.name} group={currentState.group} /> : null}
      </Row>
      <Text variant="title">{wi.name}</Text>

      <Card>
        <ActionRow
          label="Status"
          value={currentState ? <StateBadge name={currentState.name} group={currentState.group} /> : <Text variant="tertiary">—</Text>}
          onPress={() => setSheet("state")}
          disabled={!can("changeStatus")}
        />
        <Divider />
        <ActionRow label="Prioridade" value={wi.priority !== "none" ? <PriorityBadge priority={wi.priority} /> : <Text variant="tertiary">—</Text>} onPress={() => setSheet("priority")} disabled={!can("changeStatus")} />
        <Divider />
        <ActionRow
          label="Entidade"
          value={<Text>{currentEntity?.name ?? "—"}</Text>}
          onPress={() => setSheet("entity")}
          disabled={!can("changeEntity")}
        />
        <Divider />
        <ActionRow
          label="Responsável"
          value={<Text>{assignees.length ? assignees.map((a) => displayName(a)).join(", ") : "—"}</Text>}
          onPress={() => setSheet("assignee")}
          disabled={!isAdmin}
        />
      </Card>

      <Text variant="heading">Descrição</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextViewer html={wi.description_html ?? ""} minHeight={120} />
      </Card>

      <Text variant="heading">Anexos</Text>
      <Row gap={spacing.sm}>
        <Pressable onPress={pickImage} style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, alignItems: "center" }}>
          <ImageIcon size={16} color={colors.text} />
          <Text>Imagem</Text>
        </Pressable>
        <Pressable onPress={pickFile} style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, alignItems: "center" }}>
          <Paperclip size={16} color={colors.text} />
          <Text>Arquivo</Text>
        </Pressable>
      </Row>

      {saving ? <Text variant="tertiary">Salvando…</Text> : null}

      {/* Sheets */}
      <OptionSheet
        visible={sheet === "state"}
        title="Alterar status"
        selected={wi.state_id ?? undefined}
        onSelect={(v) => patch({ state_id: String(v) })}
        onClose={() => setSheet(null)}
        options={(states.data ?? []).map<SheetOption<string>>((s) => ({
          value: s.id,
          label: s.name,
          accessory: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stateGroupColors[s.group] ?? colors.textTertiary }} />,
        }))}
      />
      <OptionSheet
        visible={sheet === "priority"}
        title="Alterar prioridade"
        selected={wi.priority}
        onSelect={(v) => patch({ priority: v as Priority })}
        onClose={() => setSheet(null)}
        options={PRIORITIES.map<SheetOption<string>>((p) => ({ value: p, label: p }))}
      />
      <OptionSheet
        visible={sheet === "entity"}
        title="Alterar entidade"
        selected={wi.entity_id ?? undefined}
        onSelect={(v) => patch({ entity_id: String(v) })}
        onClose={() => setSheet(null)}
        options={(entities.data ?? []).map<SheetOption<string>>((e) => ({ value: e.id, label: e.name, description: [e.city, e.state].filter(Boolean).join(" / ") }))}
      />
      <OptionSheet
        visible={sheet === "assignee"}
        title="Alterar responsável"
        selected={wi.assignee_ids?.[0]}
        onSelect={(v) => patch({ assignee_ids: [String(v)] })}
        onClose={() => setSheet(null)}
        options={(members.data ?? []).map<SheetOption<string>>((m) => ({ value: m.id, label: displayName(m), description: m.email }))}
      />
    </Screen>
  );
}
