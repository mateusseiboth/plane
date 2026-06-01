import { useLocalSearchParams } from "expo-router";
import React from "react";
import { RefreshControl, View } from "react-native";

import { Entity, endpoints, TechnicalVisit } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Card, Divider, Loading, RichTextViewer, Row, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useTheme } from "@/theme";
import { shortDate } from "@/utils/format";

const MOTIVATIONS: { key: keyof TechnicalVisit; label: string }[] = [
  { key: "mot_update", label: "Atualização" },
  { key: "mot_bug_fix", label: "Correção de erros" },
  { key: "mot_training", label: "Treinamento" },
  { key: "mot_improvement", label: "Melhoria" },
  { key: "mot_commercial", label: "Comercial" },
  { key: "mot_other", label: "Outros" },
];

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <Row align="space-between" style={{ paddingVertical: 6 }}>
      <Text variant="secondary">{label}</Text>
      <Text weight="medium">{value || "—"}</Text>
    </Row>
  );
}

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { colors } = useTheme();

  const visit = useAsync<TechnicalVisit | null>(() => (slug && id ? endpoints.visits.get(slug, id) : Promise.resolve(null)), [slug, id]);
  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);

  if (visit.loading && !visit.data) return <Loading />;
  const v = visit.data;
  if (!v) return <Screen><Text>Visita não encontrada.</Text></Screen>;
  const entity = entities.data?.find((e) => e.id === v.entity_id);
  const tags = MOTIVATIONS.filter((m) => Boolean(v[m.key]));

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={visit.loading} onRefresh={visit.refetch} tintColor={colors.primary} />}>
      <Text variant="title">{v.visit_number ? `Visita #${v.visit_number}` : "Visita técnica"}</Text>

      <Card>
        <Field label="Entidade" value={entity?.name} />
        <Divider />
        <Field label="Município" value={v.city} />
        <Divider />
        <Field label="Período" value={v.period} />
        <Divider />
        <Field label="Programada" value={shortDate(v.scheduled_date)} />
        <Divider />
        <Field label="Executada" value={shortDate(v.started_at)} />
      </Card>

      {tags.length ? (
        <Row gap={6} style={{ flexWrap: "wrap" }}>
          {tags.map((t) => (
            <View key={String(t.key)} style={{ backgroundColor: colors.primaryMuted, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text variant="caption" color={colors.primary}>{t.label}</Text>
            </View>
          ))}
        </Row>
      ) : null}

      <Text variant="heading">Resumo</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextViewer html={v.summary ?? ""} minHeight={100} />
      </Card>

      <Text variant="heading">Conclusão</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextViewer html={v.conclusion ?? ""} minHeight={100} />
      </Card>
    </Screen>
  );
}
