/**
 * Edição do contato que recebeu a equipe.
 *
 * A pessoa vive no cadastro de Contatos da entidade (`entity-contacts/`), e é lá
 * que ela é alterada — a visita só guarda o vínculo. Por isso salvar é um PATCH
 * do contato, e "remover desta visita" é um PATCH da visita sem o id dele: o
 * cadastro continua existindo para as próximas visitas.
 */
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, View } from "react-native";

import { endpoints, EntityContact, EntityContactDraft, TechnicalVisit } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, ContactForm, Loading, Screen, Text } from "@/components";
import { useAsync } from "@/hooks/useAsync";
import { useEntityContactTypes } from "@/hooks/useEntityContacts";
import { useSync } from "@/offline/SyncProvider";
import { usePermissions } from "@/permissions/usePermissions";
import { useTheme } from "@/theme";
import { contactIdsOf, normalizeContactDraft } from "@/utils/visit-contacts";

const toDraft = (contact: EntityContact): EntityContactDraft => ({
  name: contact.name,
  type_id: contact.type_id ?? null,
  phone: contact.phone ?? "",
  email: contact.email ?? "",
});

export default function VisitContactScreen() {
  const { id, contact_id: contactId } = useLocalSearchParams<{ id?: string; contact_id: string }>();
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const router = useRouter();
  const { online } = useSync();
  const { can } = usePermissions();
  const { colors, spacing } = useTheme();

  const contact = useAsync<EntityContact | null>(
    () => (slug && contactId ? endpoints.entityContacts.get(slug, contactId) : Promise.resolve(null)),
    [slug, contactId],
  );
  const visit = useAsync<TechnicalVisit | null>(
    () => (slug && id ? endpoints.visits.get(slug, id) : Promise.resolve(null)),
    [slug, id],
  );
  const { types } = useEntityContactTypes(slug);

  const [draft, setDraft] = useState<EntityContactDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (contact.data) setDraft(toDraft(contact.data));
  }, [contact.data]);

  // Editar o cadastro segue a permissão de quem abre solicitação (mesma regra do
  // servidor); tirar da visita é edição de visita.
  const canEdit = can("createIntake") && online;
  const canUnlink = can("manageVisits") && online;

  const save = async () => {
    if (!slug || !contactId || !draft) return;
    if (!draft.name.trim()) {
      Alert.alert("Nome obrigatório", "Informe o nome do contato que recebeu a equipe.");
      return;
    }
    setSaving(true);
    try {
      await endpoints.entityContacts.update(slug, contactId, normalizeContactDraft(draft));
      router.back();
    } catch {
      Alert.alert("Erro", "Não foi possível salvar o contato.");
    } finally {
      setSaving(false);
    }
  };

  const unlink = async () => {
    if (!slug || !id || !contactId) return;
    setSaving(true);
    try {
      await endpoints.visits.update(slug, id, {
        contact_ids: contactIdsOf(visit.data).filter((c) => c !== contactId),
      });
      router.back();
    } catch {
      Alert.alert("Erro", "Não foi possível remover o contato desta visita.");
    } finally {
      setSaving(false);
    }
  };

  const confirmUnlink = () =>
    Alert.alert("Remover desta visita", "O contato continua no cadastro da entidade.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: unlink },
    ]);

  if (contact.loading && !contact.data) return <Loading />;
  if (!contact.data || !draft) return <Screen><Text>Contato não encontrado.</Text></Screen>;

  return (
    <Screen scroll>
      <Text variant="heading">Editar contato</Text>
      {contact.data.entity_name ? <Text variant="secondary">{contact.data.entity_name}</Text> : null}

      <ContactForm types={types} value={draft} onChange={setDraft} />

      {!online ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="tertiary" color={colors.pending}>
            Offline — é preciso conexão para alterar o cadastro do contato.
          </Text>
        </View>
      ) : null}

      <Button title="Salvar contato" onPress={save} loading={saving} disabled={!canEdit} />
      {id ? (
        <Button title="Remover desta visita" variant="danger" onPress={confirmUnlink} disabled={!canUnlink || saving} />
      ) : null}
    </Screen>
  );
}
