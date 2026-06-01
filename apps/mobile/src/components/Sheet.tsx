/**
 * Lightweight bottom-sheet modal used for option pickers (status, assignee,
 * entity, priority…). Generic over the option value.
 */
import React from "react";
import { FlatList, Modal, Pressable, View } from "react-native";

import { useTheme } from "@/theme";
import { Divider, Row, Text } from "./ui";

export type SheetOption<T> = {
  value: T;
  label: string;
  description?: string;
  accessory?: React.ReactNode;
};

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
        <FlatList
          data={options}
          keyExtractor={(o) => String(o.value)}
          ItemSeparatorComponent={Divider}
          renderItem={({ item }) => {
            const isSelected = item.value === selected;
            return (
              <Pressable
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.md,
                  backgroundColor: pressed ? colors.surfaceSunken : "transparent",
                })}
              >
                <Row align="space-between">
                  <Row style={{ flex: 1 }}>
                    {item.accessory}
                    <View style={{ flex: 1 }}>
                      <Text weight={isSelected ? "bold" : "regular"}>{item.label}</Text>
                      {item.description ? <Text variant="tertiary">{item.description}</Text> : null}
                    </View>
                  </Row>
                  {isSelected ? <Text color={colors.primary} weight="bold">✓</Text> : null}
                </Row>
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}
