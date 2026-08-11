import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import React, { useCallback, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, View } from "react-native";

import { Entity, endpoints, EntityContact, TechnicalVisit } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Card, ContactSheet, Divider, Loading, RichTextViewer, Row, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useEntityContacts } from "@/hooks/useEntityContacts";
import { useSync } from "@/offline/SyncProvider";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";
import { shortDate } from "@/utils/format";
import { contactIdsOf, contactSubtitle, parseContacts } from "@/utils/visit-contacts";

const MOTIVATIONS: { key: keyof TechnicalVisit; label: string }[] = [
  { key: "mot_update", label: "Atualização" },
  { key: "mot_bug_fix", label: "Correção de erros" },
  { key: "mot_training", label: "Treinamento" },
  { key: "mot_improvement", label: "Melhoria" },
  { key: "mot_commercial", label: "Comercial" },
  { key: "mot_other", label: "Outros" },
];

// Concluída (4) e Cancelada (5) são fechadas para edição, igual à web.
const CLOSED_STATUS = [4, 5];

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
  const router = useRouter();
  const { can } = usePermissions();
  const { online } = useSync();
  const { colors, radius, spacing } = useTheme();

  const visit = useAsync<TechnicalVisit | null>(() => (slug && id ? endpoints.visits.get(slug, id) : Promise.resolve(null)), [slug, id]);
  const entities = useAsync<Entity[]>(() => (slug ? endpoints.entities.list(slug) : Promise.resolve([])), [slug]);
  // Só busca depois de saber a visita: antes disso a entidade é desconhecida e
  // a lista viria com os contatos do espaço inteiro.
  const directory = useEntityContacts(visit.data ? slug : undefined, visit.data?.entity_id);

  const [picker, setPicker] = useState(false);
  const [linking, setLinking] = useState(false);

  // O cadastro do contato é editado em outra rota; ao voltar dela esta tela
  // não remonta, então sem recarregar no foco a lista continuaria desatualizada.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      visit.refetch();
    }, [visit.refetch]),
  );

  if (visit.loading && !visit.data) return <Loading />;
  const v = visit.data;
  if (!v) return <Screen><Text>Visita não encontrada.</Text></Screen>;
  const entity = entities.data?.find((e) => e.id === v.entity_id);
  const tags = MOTIVATIONS.filter((m) => Boolean(v[m.key]));
  const contacts = v.contact_records ?? [];
  const linkedIds = contactIdsOf(v);
  const legacyContacts = parseContacts(v.contacts);
  const canEditContacts = can("manageVisits") && !CLOSED_STATUS.includes(v.status ?? 0);

  // Vincular exige o id que só o servidor emite, então não passa pelo outbox
  // (que enfileira apenas criações): sem conexão a seção fica só de leitura.
  const setContactIds = async (ids: string[]) => {
    if (!slug || !id) return;
    setLinking(true);
    try {
      await endpoints.visits.update(slug, id, { contact_ids: ids });
      visit.refetch();
    } catch {
      Alert.alert("Erro", "Não foi possível atualizar os responsáveis desta visita.");
    } finally {
      setLinking(false);
    }
  };

  const toggleContact = (contact: EntityContact) =>
    setContactIds(
      linkedIds.includes(contact.id) ? linkedIds.filter((c) => c !== contact.id) : [...linkedIds, contact.id],
    );

  const openEditor = (contactId: string) => router.push(`/visit/contact?id=${v.id}&contact_id=${contactId}`);

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

      <Row align="space-between">
        <Text variant="heading">Responsáveis</Text>
        {canEditContacts && online && contacts.length ? (
          <Button title="Adicionar" variant="ghost" onPress={() => setPicker(true)} />
        ) : null}
      </Row>
      <Card>
        {contacts.length ? (
          contacts.map((c, i) => (
            <React.Fragment key={c.id}>
              {i ? <Divider /> : null}
              <Pressable disabled={!canEditContacts || !online} onPress={() => openEditor(c.id)} style={{ paddingVertical: 8 }}>
                <Row align="space-between">
                  <View style={{ flex: 1 }}>
                    <Text weight="medium">{c.name}</Text>
                    {contactSubtitle(c) ? <Text variant="tertiary">{contactSubtitle(c)}</Text> : null}
                  </View>
                  {canEditContacts && online ? <ChevronRight size={16} color={colors.textTertiary} /> : null}
                </Row>
              </Pressable>
            </React.Fragment>
          ))
        ) : (
          <>
            <Text variant="secondary">Ninguém registrado como responsável nesta visita.</Text>
            {canEditContacts && online ? (
              <Button title="Adicionar contato" variant="secondary" onPress={() => setPicker(true)} />
            ) : null}
          </>
        )}

        {legacyContacts.length ? (
          <>
            <Divider />
            <Text variant="caption">Anotado no SAC (histórico, somente leitura)</Text>
            {legacyContacts.map((name, i) => (
              <Text key={`${i}-${name}`} variant="secondary">• {name}</Text>
            ))}
          </>
        ) : null}

        {canEditContacts && !online ? (
          <View style={{ backgroundColor: colors.pendingBg, borderRadius: radius.sm, padding: spacing.sm }}>
            <Text variant="tertiary" color={colors.pending}>
              Offline — é preciso conexão para alterar os responsáveis desta visita.
            </Text>
          </View>
        ) : null}
      </Card>

      <Text variant="heading">Resumo</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextViewer html={v.summary ?? ""} minHeight={100} />
      </Card>

      <Text variant="heading">Conclusão</Text>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <RichTextViewer html={v.conclusion ?? ""} minHeight={100} />
      </Card>

      <ContactSheet
        visible={picker}
        contacts={directory.contacts}
        types={directory.types}
        defaultTypeId={directory.defaultTypeId}
        selectedIds={linkedIds}
        loading={directory.loading}
        busy={linking}
        canCreate={can("createIntake")}
        emptyHint={
          v.entity_id
            ? "Nenhum contato cadastrado nesta entidade — cadastre quem recebeu a equipe."
            : "Esta visita não tem entidade; a lista mostra os contatos do espaço de trabalho."
        }
        onToggle={toggleContact}
        onCreate={async (draft) => {
          const created = await directory.create(draft);
          await setContactIds([...linkedIds, created.id]);
        }}
        onClose={() => setPicker(false)}
      />
    </Screen>
  );
}
