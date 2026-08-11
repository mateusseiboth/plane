/**
 * Campos de um contato do cadastro da entidade. O mesmo formulário serve ao
 * cadastro rápido de dentro da visita e à edição do contato, por isso ele só
 * recebe e devolve o rascunho — quem grava é a tela.
 */
import React from "react";
import { Pressable, View } from "react-native";

import { EntityContactDraft, EntityContactType } from "@/api";
import { useTheme } from "@/theme";
import { Input, Row, Text } from "./ui";

function TypeChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: active ? colors.primary : colors.border,
        backgroundColor: active ? colors.primaryMuted : "transparent",
        paddingHorizontal: spacing.md,
        paddingVertical: 6,
      }}
    >
      <Text variant="caption" color={active ? colors.primary : colors.textSecondary}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ContactForm({
  types,
  value,
  onChange,
  autoFocus,
}: {
  types: EntityContactType[];
  value: EntityContactDraft;
  onChange: (draft: EntityContactDraft) => void;
  autoFocus?: boolean;
}) {
  const { spacing } = useTheme();
  const set = (patch: Partial<EntityContactDraft>) => onChange({ ...value, ...patch });

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">Nome</Text>
        <Input
          value={value.name}
          onChangeText={(name) => set({ name })}
          placeholder="Maria Souza"
          autoFocus={autoFocus}
        />
      </View>

      {types.length ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="caption">Tipo</Text>
          <Row gap={spacing.xs} style={{ flexWrap: "wrap" }} align="flex-start">
            {types.map((t) => (
              <TypeChip key={t.id} label={t.name} active={t.id === value.type_id} onPress={() => set({ type_id: t.id })} />
            ))}
          </Row>
        </View>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">Telefone</Text>
        <Input
          value={value.phone ?? ""}
          onChangeText={(phone) => set({ phone })}
          placeholder="(67) 99999-0000"
          keyboardType="phone-pad"
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text variant="caption">E-mail</Text>
        <Input
          value={value.email ?? ""}
          onChangeText={(email) => set({ email })}
          placeholder="maria@entidade.gov.br"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
}
