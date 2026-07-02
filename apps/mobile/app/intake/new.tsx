import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { Entity, endpoints, Member, Priority } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Input, RichTextEditor, Row, Screen, Text } from "@/components";
import { MultiOptionSheet, OptionSheet } from "@/components/Sheet";
import { useAsync } from "@/hooks/useAsync";
import { useSync } from "@/offline/SyncProvider";
import { useTheme } from "@/theme";
import { displayName } from "@/utils/format";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];
const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Nenhuma",
};

function FieldButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: "45%", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md }}>
      <Text variant="caption">{label}</Text>
      <Text weight="medium" numberOfLines={1}>{value}</Text>
    </Pressable>
  );
}

export default function NewIntakeScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { online, enqueue } = useSync();
  const { colors, spacing } = useTheme();

  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);
  const members = useAsync<Member[]>(() => (slug && projectId ? endpoints.projects.members(slug, projectId) : Promise.resolve([])), [slug, projectId]);

  const [name, setName] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [entityId, setEntityId] = useState<string | undefined>();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [sheet, setSheet] = useState<null | "priority" | "entity" | "assignees">(null);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const submit = async () => {
    if (!slug || !projectId || !name.trim()) return;
    const body = {
      name: name.trim(),
      description_html: descriptionHtml,
      priority,
      entity_id: entityId,
      assignee_ids: assigneeIds,
    };
    setSaving(true);
    try {
      if (online) await endpoints.intake.create(slug, projectId, body);
      else await enqueue({ kind: "intake", slug, projectId, label: name.trim(), body });
      router.back();
    } catch {
      await enqueue({ kind: "intake", slug, projectId, label: name.trim(), body });
      Alert.alert("Salvo offline", "O intake será sincronizado quando a conexão voltar.");
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const selectedEntity = entities.data?.find((e) => e.id === entityId);
  const assigneeNames = assigneeIds
    .map((aid) => members.data?.find((m) => m.id === aid))
    .filter(Boolean)
    .map((m) => displayName(m as Member));

  return (
    <Screen scroll>
      <Card style={{ backgroundColor: colors.primaryMuted, borderColor: colors.primary }}>
        <Text variant="caption" color={colors.primary}>
          Itens de intake entram em triagem e precisam ser aprovados antes de virar work item.
        </Text>
      </Card>

      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">Título</Text>
        <Input value={name} onChangeText={setName} placeholder="Resumo do chamado" />
      </View>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextEditor value={descriptionHtml} onChange={setDescriptionHtml} placeholder="Descreva o chamado…" minHeight={200} />
      </Card>

      <Row gap={spacing.md} style={{ flexWrap: "wrap" }}>
        <FieldButton label="Prioridade" value={PRIORITY_LABELS[priority]} onPress={() => setSheet("priority")} />
        <FieldButton label="Entidade" value={selectedEntity?.name ?? "—"} onPress={() => setSheet("entity")} />
        <FieldButton
          label="Responsáveis"
          value={assigneeNames.length ? assigneeNames.join(", ") : "—"}
          onPress={() => setSheet("assignees")}
        />
      </Row>

      {!online ? <Text variant="tertiary" color={colors.pending}>Offline — será sincronizado depois.</Text> : null}
      <Button title="Abrir intake" onPress={submit} loading={saving} disabled={!name.trim()} />

      <OptionSheet
        visible={sheet === "priority"}
        title="Prioridade"
        selected={priority}
        onSelect={(v) => setPriority(v as Priority)}
        onClose={() => setSheet(null)}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
      />
      <OptionSheet
        visible={sheet === "entity"}
        title="Entidade"
        selected={entityId}
        onSelect={(v) => setEntityId(String(v))}
        onClose={() => setSheet(null)}
        options={(entities.data ?? []).map((e) => ({
          value: e.id,
          label: e.name,
          description: [e.city, e.state].filter(Boolean).join(" / ") || undefined,
        }))}
      />
      <MultiOptionSheet
        visible={sheet === "assignees"}
        title="Responsáveis"
        selected={assigneeIds}
        onToggle={(v) => setAssigneeIds((prev) => toggle(prev, String(v)))}
        onClose={() => setSheet(null)}
        options={(members.data ?? []).map((m) => ({ value: m.id, label: displayName(m), description: m.email }))}
      />
    </Screen>
  );
}
