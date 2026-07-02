/**
 * Lightweight bottom-sheet modals used for option pickers (status, assignee,
 * entity, priority…). Generic over the option value. Variants: single-select
 * (closes on tap), multi-select (toggles, closes via button) and date picker.
 */
import { Check } from "lucide-react-native";
import React from "react";
import { FlatList, Modal, Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { MonthCalendar } from "./MonthCalendar";
import { Button, Divider, Row, Text } from "./ui";

export type SheetOption<T> = {
  value: T;
  label: string;
  description?: string;
  accessory?: React.ReactNode;
};

function SheetContainer({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.overlay }} onPress={onClose} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: spacing.md,
          paddingBottom: spacing.xxl,
          maxHeight: "70%",
        }}
      >
        <View style={{ alignItems: "center", paddingBottom: spacing.sm }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
        </View>
        <Text variant="heading" style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          {title}
        </Text>
        <Divider />
        {children}
      </View>
    </Modal>
  );
}

function OptionRow<T>({ option, isSelected, onPress }: { option: SheetOption<T>; isSelected: boolean; onPress: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        backgroundColor: pressed ? colors.surfaceSunken : "transparent",
      })}
    >
      <Row align="space-between">
        <Row style={{ flex: 1 }}>
          {option.accessory}
          <View style={{ flex: 1 }}>
            <Text weight={isSelected ? "bold" : "regular"}>{option.label}</Text>
            {option.description ? <Text variant="tertiary">{option.description}</Text> : null}
          </View>
        </Row>
        {isSelected ? <Check size={18} color={colors.primary} /> : null}
      </Row>
    </Pressable>
  );
}

export function OptionSheet<T extends string | number>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption<T>[];
  selected?: T;
  onSelect: (value: T) => void;
  onClose: () => void;
}) {
  return (
    <SheetContainer visible={visible} title={title} onClose={onClose}>
      <FlatList
        data={options}
        keyExtractor={(o) => String(o.value)}
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => (
          <OptionRow
            option={item}
            isSelected={item.value === selected}
            onPress={() => {
              onSelect(item.value);
              onClose();
            }}
          />
        )}
      />
    </SheetContainer>
  );
}

export function MultiOptionSheet<T extends string | number>({
  visible,
  title,
  options,
  selected,
  onToggle,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption<T>[];
  selected: T[];
  onToggle: (value: T) => void;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  return (
    <SheetContainer visible={visible} title={title} onClose={onClose}>
      <FlatList
        data={options}
        keyExtractor={(o) => String(o.value)}
        ItemSeparatorComponent={Divider}
        renderItem={({ item }) => (
          <OptionRow option={item} isSelected={selected.includes(item.value)} onPress={() => onToggle(item.value)} />
        )}
      />
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <Button title="Concluir" onPress={onClose} />
      </View>
    </SheetContainer>
  );
}

export function DateSheet({
  visible,
  title,
  value,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: Date | null;
  onSelect: (d: Date | null) => void;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  return (
    <SheetContainer visible={visible} title={title} onClose={onClose}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        <MonthCalendar eventDates={[]} selected={value} onSelect={onSelect} />
        <Row gap={spacing.sm}>
          <View style={{ flex: 1 }}>
            <Button title="Limpar" variant="secondary" onPress={() => { onSelect(null); onClose(); }} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Concluir" onPress={onClose} />
          </View>
        </Row>
      </View>
    </SheetContainer>
  );
}
