import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, View } from "react-native";

import { endpoints, Priority, State } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Input, RichTextEditor, Row, Screen, Text } from "@/components";
import { OptionSheet } from "@/components/Sheet";
import { useAsync } from "@/hooks/useAsync";
import { useSync } from "@/offline/SyncProvider";
import { stateGroupColors, useTheme } from "@/theme";
import { Pressable } from "react-native";

const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

export default function NewWorkItemScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { online, enqueue } = useSync();
  const { colors, spacing } = useTheme();

  const states = useAsync<State[]>(() => (slug && projectId ? endpoints.projects.states(slug, projectId) : Promise.resolve([])), [slug, projectId]);

  const [name, setName] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [priority, setPriority] = useState<Priority>("none");
  const [stateId, setStateId] = useState<string | undefined>();
  const [sheet, setSheet] = useState<null | "priority" | "state">(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!slug || !projectId || !name.trim()) return;
    const body = { name: name.trim(), description_html: descriptionHtml, priority, state_id: stateId };
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

  return (
    <Screen scroll>
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">Título</Text>
        <Input value={name} onChangeText={setName} placeholder="Resumo do chamado" />
      </View>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextEditor value={descriptionHtml} onChange={setDescriptionHtml} placeholder="Descreva o chamado…" minHeight={220} />
      </Card>

      <Row gap={spacing.md}>
        <Pressable onPress={() => setSheet("priority")} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md }}>
          <Text variant="caption">Prioridade</Text>
          <Text weight="medium">{priority}</Text>
        </Pressable>
        <Pressable onPress={() => setSheet("state")} style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md }}>
          <Text variant="caption">Status</Text>
          <Text weight="medium">{selectedState?.name ?? "Padrão"}</Text>
        </Pressable>
      </Row>

      {!online ? <Text variant="tertiary" color={colors.pending}>Offline — será sincronizado depois.</Text> : null}

      <Button title="Criar work item" onPress={submit} loading={saving} disabled={!name.trim()} />

      <OptionSheet
        visible={sheet === "priority"}
        title="Prioridade"
        selected={priority}
        onSelect={(v) => setPriority(v as Priority)}
        onClose={() => setSheet(null)}
        options={PRIORITIES.map((p) => ({ value: p, label: p }))}
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
    </Screen>
  );
}
