/**
 * Escolha de contatos da entidade: marca quem já está cadastrado e, quando quem
 * recebeu a equipe ainda não existe, cadastra ali mesmo. "Contato" é o nome do
 * cadastro; dentro da visita esse contato é chamado de responsável.
 * A folha só apresenta — carregar a lista e gravar é da tela que a usa.
 */
import { Check, UserPlus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { ApiError, EntityContact, EntityContactDraft, EntityContactType } from "@/api";
import { useTheme } from "@/theme";
import { contactSubtitle, matchesContact } from "@/utils/visit-contacts";
import { ContactForm } from "./ContactForm";
import { SheetContainer } from "./Sheet";
import { Button, Divider, Input, Loading, Row, Text } from "./ui";

function ContactRow({
  contact,
  selected,
  disabled,
  onPress,
}: {
  contact: EntityContact;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const subtitle = contactSubtitle(contact);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: pressed ? colors.surfaceSunken : "transparent",
        opacity: disabled ? 0.6 : 1,
      })}
    >
      <Row align="space-between">
        <View style={{ flex: 1 }}>
          <Text weight={selected ? "bold" : "regular"}>{contact.name}</Text>
          {subtitle ? <Text variant="tertiary">{subtitle}</Text> : null}
        </View>
        {selected ? <Check size={18} color={colors.primary} /> : null}
      </Row>
    </Pressable>
  );
}

export function ContactSheet({
  visible,
  contacts,
  types,
  selectedIds,
  defaultTypeId,
  loading,
  busy,
  canCreate,
  emptyHint,
  onToggle,
  onCreate,
  onClose,
}: {
  visible: boolean;
  contacts: EntityContact[];
  types: EntityContactType[];
  selectedIds: string[];
  defaultTypeId?: string | null;
  /** Lista ainda carregando. */
  loading?: boolean;
  /** Vínculo sendo gravado pela tela — trava a lista para evitar toque duplo. */
  busy?: boolean;
  canCreate?: boolean;
  emptyHint?: string;
  onToggle: (contact: EntityContact) => void;
  onCreate: (draft: EntityContactDraft) => Promise<void>;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState("");
  // Rascunho preenchido = modo cadastro; nulo = modo lista.
  const [draft, setDraft] = useState<EntityContactDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) return;
    setQuery("");
    setDraft(null);
    setError(null);
  }, [visible]);

  const filtered = contacts.filter((c) => matchesContact(c, query));

  // O que já foi digitado na busca costuma ser o nome de quem não está na lista.
  const startCreate = () => {
    setError(null);
    setDraft({ name: query.trim(), type_id: defaultTypeId ?? null, phone: "", email: "" });
  };

  const submit = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) {
      setError("Informe o nome do contato.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({ ...draft, name });
      setDraft(null);
      setQuery("");
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "Não foi possível cadastrar o contato.");
    } finally {
      setSaving(false);
    }
  };

  // Uma folha só: trocar de Modal entre lista e cadastro reiniciaria a animação.
  return (
    <SheetContainer visible={visible} title={draft ? "Novo contato" : "Contatos"} onClose={onClose}>
      {draft ? (
        <ScrollView
          style={{ flexShrink: 1 }}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          keyboardShouldPersistTaps="handled"
        >
          <ContactForm types={types} value={draft} onChange={setDraft} autoFocus />
          <Text variant="tertiary">Fica no cadastro de contatos da entidade e pode ser reaproveitado nas próximas visitas.</Text>
          {error ? <Text variant="secondary" color={colors.danger}>{error}</Text> : null}
          <Button title="Cadastrar e vincular" onPress={submit} loading={saving} />
          <Button title="Cancelar" variant="ghost" onPress={() => setDraft(null)} disabled={saving} />
        </ScrollView>
      ) : (
        <>
          <View style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por nome, telefone ou e-mail"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Divider />

          {loading && !contacts.length ? (
            <Loading />
          ) : (
            <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
              {filtered.length ? (
                filtered.map((c, i) => (
                  <React.Fragment key={c.id}>
                    {i ? <Divider /> : null}
                    <ContactRow
                      contact={c}
                      selected={selectedIds.includes(c.id)}
                      disabled={busy}
                      onPress={() => onToggle(c)}
                    />
                  </React.Fragment>
                ))
              ) : (
                <View style={{ padding: spacing.lg }}>
                  <Text variant="secondary">{emptyHint ?? "Nenhum contato cadastrado nesta entidade."}</Text>
                </View>
              )}
            </ScrollView>
          )}

          <Divider />
          <View style={{ padding: spacing.lg, gap: spacing.sm }}>
            {canCreate ? (
              <Button
                title="Cadastrar novo contato"
                variant="secondary"
                icon={<UserPlus size={16} color={colors.text} />}
                onPress={startCreate}
              />
            ) : null}
            <Button title="Concluir" onPress={onClose} />
          </View>
        </>
      )}
    </SheetContainer>
  );
}
