import { useRouter } from "expo-router";
import { Check } from "lucide-react-native";
import React, { useState } from "react";
import { Alert, Pressable, View } from "react-native";

import { Entity, endpoints, TechnicalVisit } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Input, RichTextEditor, Row, Screen, Text } from "@/components";
import { OptionSheet } from "@/components/Sheet";
import { useAsync } from "@/hooks/useAsync";
import { useSync } from "@/offline/SyncProvider";
import { useTheme } from "@/theme";

const MOTIVATIONS: { key: string; label: string }[] = [
  { key: "mot_update", label: "Atualização" },
  { key: "mot_bug_fix", label: "Correção de erros" },
  { key: "mot_training", label: "Acompanhamento/Treinamento" },
  { key: "mot_improvement", label: "Solicitação de melhoria" },
  { key: "mot_commercial", label: "Comercial" },
  { key: "mot_other", label: "Outros" },
];

export default function NewVisitScreen() {
  const { activeWorkspace, me } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { online, enqueue } = useSync();
  const { colors, spacing } = useTheme();

  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);

  const [entityId, setEntityId] = useState<string | undefined>();
  const [city, setCity] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [period, setPeriod] = useState("");
  const [summary, setSummary] = useState("");
  const [conclusion, setConclusion] = useState("");
  const [mot, setMot] = useState<Record<string, boolean>>({});
  const [motOther, setMotOther] = useState("");
  const [entitySheet, setEntitySheet] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (k: string) => setMot((m) => ({ ...m, [k]: !m[k] }));

  const submit = async () => {
    if (!slug) return;
    const body: Partial<TechnicalVisit> = {
      entity_id: entityId,
      technician_id: me?.id,
      city: city.trim() || null,
      scheduled_date: scheduledDate.trim() || null,
      period: period.trim() || null,
      summary,
      conclusion,
      mot_update: !!mot.mot_update,
      mot_bug_fix: !!mot.mot_bug_fix,
      mot_training: !!mot.mot_training,
      mot_improvement: !!mot.mot_improvement,
      mot_commercial: !!mot.mot_commercial,
      mot_other: !!mot.mot_other,
      mot_other_description: motOther.trim() || null,
    };
    setSaving(true);
    try {
      if (online) await endpoints.visits.create(slug, body);
      else await enqueue({ kind: "visit", slug, label: city || "Visita", body: body as Record<string, unknown> });
      router.back();
    } catch {
      await enqueue({ kind: "visit", slug, label: city || "Visita", body: body as Record<string, unknown> });
      Alert.alert("Salvo offline", "A visita será sincronizada quando a conexão voltar.");
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const selectedEntity = entities.data?.find((e) => e.id === entityId);

  return (
    <Screen scroll>
      <Pressable onPress={() => setEntitySheet(true)} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md }}>
        <Text variant="caption">Entidade</Text>
        <Text weight="medium">{selectedEntity?.name ?? "Selecionar"}</Text>
      </Pressable>

      <Row gap={spacing.md}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="caption">Município</Text>
          <Input value={city} onChangeText={setCity} placeholder="Cidade" />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="caption">Período</Text>
          <Input value={period} onChangeText={setPeriod} placeholder="Manhã/Tarde" />
        </View>
      </Row>

      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">Data programada (AAAA-MM-DD)</Text>
        <Input value={scheduledDate} onChangeText={setScheduledDate} placeholder="2026-06-15" autoCapitalize="none" />
      </View>

      <Text variant="heading">Motivações</Text>
      <Card>
        {MOTIVATIONS.map((m) => (
          <Pressable key={m.key} onPress={() => toggle(m.key)} style={{ paddingVertical: spacing.sm }}>
            <Row gap={spacing.sm}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: mot[m.key] ? colors.primary : colors.border,
                  backgroundColor: mot[m.key] ? colors.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mot[m.key] ? <Check size={16} color={colors.onPrimary} /> : null}
              </View>
              <Text>{m.label}</Text>
            </Row>
          </Pressable>
        ))}
        {mot.mot_other ? <Input value={motOther} onChangeText={setMotOther} placeholder="Descreva outros motivos" /> : null}
      </Card>

      <Text variant="heading">Resumo</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextEditor value={summary} onChange={setSummary} placeholder="Resumo da visita…" minHeight={160} />
      </Card>

      <Text variant="heading">Conclusão</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextEditor value={conclusion} onChange={setConclusion} placeholder="Conclusão / próximos passos…" minHeight={160} />
      </Card>

      {!online ? <Text variant="tertiary" color={colors.pending}>Offline — será sincronizado depois.</Text> : null}
      <Button title="Salvar visita" onPress={submit} loading={saving} />

      <OptionSheet
        visible={entitySheet}
        title="Entidade"
        selected={entityId}
        onSelect={(v) => setEntityId(String(v))}
        onClose={() => setEntitySheet(false)}
        options={(entities.data ?? []).map((e) => ({ value: e.id, label: e.name, description: [e.city, e.state].filter(Boolean).join(" / ") }))}
      />
    </Screen>
  );
}
