import { format } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { Entity, endpoints, Label, Member, Priority, State } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Input, RichTextEditor, Row, Screen, Text } from "@/components";
import { DateSheet, MultiOptionSheet, OptionSheet } from "@/components/Sheet";
import { useAsync } from "@/hooks/useAsync";
import { useSync } from "@/offline/SyncProvider";
import { stateGroupColors, useTheme } from "@/theme";
import { displayName, shortDate } from "@/utils/format";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];
const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Nenhuma",
};

type SheetKind = null | "priority" | "state" | "entity" | "assignees" | "labels" | "startDate" | "targetDate";

function FieldButton({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable onPress={onPress} style={{ flex: 1, minWidth: "45%", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md }}>
      <Text variant="caption">{label}</Text>
      <Text weight="medium" numberOfLines={1}>{value}</Text>
    </Pressable>
  );
}

export default function NewWorkItemScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { online, enqueue } = useSync();
  const { colors, spacing } = useTheme();

  const states = useAsync<State[]>(() => (slug && projectId ? endpoints.projects.states(slug, projectId) : Promise.resolve([])), [slug, projectId]);
  const members = useAsync<Member[]>(() => (slug && projectId ? endpoints.projects.members(slug, projectId) : Promise.resolve([])), [slug, projectId]);
  const labels = useAsync<Label[]>(() => (slug && projectId ? endpoints.projects.labels(slug, projectId) : Promise.resolve([])), [slug, projectId]);
  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);

  const [name, setName] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [stateId, setStateId] = useState<string | undefined>();
  const [entityId, setEntityId] = useState<string | undefined>();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [targetDate, setTargetDate] = useState<Date | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const buildBody = () => ({
    name: name.trim(),
    description_html: descriptionHtml,
    priority,
    state_id: stateId,
    entity_id: entityId,
    assignee_ids: assigneeIds,
    label_ids: labelIds,
    start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
    target_date: targetDate ? format(targetDate, "yyyy-MM-dd") : undefined,
  });

  const submit = async () => {
    if (!slug || !projectId || !name.trim()) return;
    const body = buildBody();
    setSaving(true);
    try {
      if (online) {
        await endpoints.issues.create(slug, projectId, body);
      } else {
        await enqueue({ kind: "work-item", slug, projectId, label: name.trim(), body });
      }
      router.back();
    } catch {
      // Network failure while "online": fall back to the outbox.
      await enqueue({ kind: "work-item", slug, projectId, label: name.trim(), body });
      Alert.alert("Salvo offline", "O work item será sincronizado quando a conexão voltar.");
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const selectedState = states.data?.find((s) => s.id === stateId);
  const selectedEntity = entities.data?.find((e) => e.id === entityId);
  const assigneeNames = assigneeIds
    .map((aid) => members.data?.find((m) => m.id === aid))
    .filter(Boolean)
    .map((m) => displayName(m as Member));
  const labelNames = labelIds
    .map((lid) => labels.data?.find((l) => l.id === lid)?.name)
    .filter(Boolean) as string[];

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">Título</Text>
        <Input value={name} onChangeText={setName} placeholder="Resumo do chamado" />
      </View>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextEditor value={descriptionHtml} onChange={setDescriptionHtml} placeholder="Descreva o chamado…" minHeight={220} />
      </Card>

      <Row gap={spacing.md} style={{ flexWrap: "wrap" }}>
        <FieldButton label="Prioridade" value={PRIORITY_LABELS[priority]} onPress={() => setSheet("priority")} />
        <FieldButton label="Status" value={selectedState?.name ?? "Padrão"} onPress={() => setSheet("state")} />
        <FieldButton label="Entidade" value={selectedEntity?.name ?? "—"} onPress={() => setSheet("entity")} />
        <FieldButton
          label="Responsáveis"
          value={assigneeNames.length ? assigneeNames.join(", ") : "—"}
          onPress={() => setSheet("assignees")}
        />
        <FieldButton
          label="Labels"
          value={labelNames.length ? labelNames.join(", ") : "—"}
          onPress={() => setSheet("labels")}
        />
        <FieldButton
          label="Início"
          value={startDate ? shortDate(startDate.toISOString()) : "—"}
          onPress={() => setSheet("startDate")}
        />
        <FieldButton
          label="Prazo"
          value={targetDate ? shortDate(targetDate.toISOString()) : "—"}
          onPress={() => setSheet("targetDate")}
        />
      </Row>

      {!online ? <Text variant="tertiary" color={colors.pending}>Offline — será sincronizado depois.</Text> : null}

      <Button title="Criar work item" onPress={submit} loading={saving} disabled={!name.trim()} />

      <OptionSheet
        visible={sheet === "priority"}
        title="Prioridade"
        selected={priority}
        onSelect={(v) => setPriority(v as Priority)}
        onClose={() => setSheet(null)}
        options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
      />
      <OptionSheet
        visible={sheet === "state"}
        title="Status inicial"
        selected={stateId}
        onSelect={(v) => setStateId(String(v))}
        onClose={() => setSheet(null)}
        options={(states.data ?? []).map((s) => ({
          value: s.id,
          label: s.name,
          accessory: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: stateGroupColors[s.group] ?? colors.textTertiary }} />,
        }))}
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
      <MultiOptionSheet
        visible={sheet === "labels"}
        title="Labels"
        selected={labelIds}
        onToggle={(v) => setLabelIds((prev) => toggle(prev, String(v)))}
        onClose={() => setSheet(null)}
        options={(labels.data ?? []).map((l) => ({
          value: l.id,
          label: l.name,
          accessory: <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color ?? colors.textTertiary }} />,
        }))}
      />
      <DateSheet
        visible={sheet === "startDate"}
        title="Data de início"
        value={startDate}
        onSelect={setStartDate}
        onClose={() => setSheet(null)}
      />
      <DateSheet
        visible={sheet === "targetDate"}
        title="Prazo"
        value={targetDate}
        onSelect={setTargetDate}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}
