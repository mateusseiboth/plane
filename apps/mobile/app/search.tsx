import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { endpoints, SearchHit, SearchResults } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Input, LegacyTicketBadge, PriorityBadge, Row, Screen, StateBadge, Text } from "@/components";
import { useTheme } from "@/theme";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function SearchScreen() {
  const router = useRouter();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounced(query, 300);

  useEffect(() => {
    if (!slug || !debounced.trim()) {
      setResults(null);
      return;
    }
    let active = true;
    setLoading(true);
    endpoints.search
      .global(slug, debounced.trim())
      .then((r) => active && setResults(r.results))
      .catch(() => active && setResults(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug, debounced]);

  const openHit = (hit: SearchHit) => {
    const projectId = hit.project?.id;
    if (hit.type === "intake") router.push(`/intake/${hit.id}?projectId=${projectId}`);
    else router.push(`/work-item/${hit.id}?projectId=${projectId}`);
  };

  const Section = ({ title, hits }: { title: string; hits: SearchHit[] }) =>
    hits.length === 0 ? null : (
      <View style={{ gap: spacing.sm }}>
        <Text variant="caption" style={{ textTransform: "uppercase" }}>{title}</Text>
        {hits.map((hit) => (
          <Pressable
            key={hit.id}
            onPress={() => openHit(hit)}
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: spacing.md, gap: 6 }}
          >
            <Row gap={6} style={{ flexWrap: "wrap" }}>
              <LegacyTicketBadge number={hit.legacy_ticket_number} />
              <PriorityBadge priority={hit.priority} />
              {hit.project ? <Text variant="tertiary">{hit.project.identifier}</Text> : null}
            </Row>
            <Text numberOfLines={2}>{hit.name}</Text>
            {hit.state ? <StateBadge name={hit.state.name} group={hit.state.group} /> : null}
          </Pressable>
        ))}
      </View>
    );

  return (
    <Screen padded={false}>
      <View style={{ padding: spacing.lg, gap: spacing.sm }}>
        <Row gap={spacing.sm} style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing.md }}>
          <Text style={{ fontSize: 16 }}>🔍</Text>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="work items, intakes, #1234-2026…"
            autoFocus
            style={{ flex: 1, borderWidth: 0, backgroundColor: "transparent" }}
          />
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
        </Row>
        <Text variant="tertiary">Busca full-text com tolerância a erros.</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        {results ? (
          <>
            <Section title="Work Items" hits={results.issues} />
            <Section title="Intakes" hits={results.intakes} />
            {results.issues.length === 0 && results.intakes.length === 0 && !loading ? (
              <Text variant="secondary" style={{ textAlign: "center", marginTop: spacing.xl }}>Nenhum resultado.</Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
