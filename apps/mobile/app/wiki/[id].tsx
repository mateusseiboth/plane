import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, RefreshControl } from "react-native";

import { endpoints, WikiPage } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, Loading, RichTextEditor, RichTextViewer, Row, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";

export default function WikiPageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const { can } = usePermissions();
  const { colors } = useTheme();

  const page = useAsync<WikiPage | null>(() => (slug && id ? endpoints.pages.get(slug, id) : Promise.resolve(null)), [slug, id]);

  const [editing, setEditing] = useState(false);
  const [html, setHtml] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (page.data) setHtml(page.data.description_html ?? "");
  }, [page.data]);

  const save = async () => {
    if (!slug || !id) return;
    setSaving(true);
    try {
      await endpoints.pages.update(slug, id, { description_html: html });
      setEditing(false);
      page.refetch();
    } catch {
      Alert.alert("Erro", "Não foi possível salvar a página.");
    } finally {
      setSaving(false);
    }
  };

  if (page.loading && !page.data) return <Loading />;
  const p = page.data;
  if (!p) return <Screen><Text>Página não encontrada.</Text></Screen>;

  return (
    <Screen scroll refreshControl={<RefreshControl refreshing={page.loading} onRefresh={page.refetch} tintColor={colors.primary} />}>
      <Row align="space-between">
        <Text variant="title" style={{ flex: 1 }}>{p.name || "Sem título"}</Text>
        {can("editWiki") && !p.is_locked ? (
          <Button title={editing ? "Cancelar" : "Editar"} variant="ghost" onPress={() => setEditing((e) => !e)} />
        ) : null}
      </Row>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {editing ? (
          <RichTextEditor value={html} onChange={setHtml} minHeight={300} placeholder="Conteúdo da página…" />
        ) : (
          <RichTextViewer html={p.description_html ?? ""} minHeight={200} />
        )}
      </Card>

      {editing ? <Button title="Salvar" onPress={save} loading={saving} /> : null}
    </Screen>
  );
}
