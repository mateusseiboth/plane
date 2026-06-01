import React, { useState } from "react";
import { Pressable } from "react-native";

import { Project } from "@/api";
import { useTheme } from "@/theme";
import { OptionSheet } from "./Sheet";
import { Row, Text } from "./ui";

export function ProjectPicker({
  projects,
  current,
  onSelect,
}: {
  projects: Project[];
  current: Project | null;
  onSelect: (projectId: string) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          alignSelf: "flex-start",
        }}
      >
        <Text weight="medium">{current ? current.name : "Selecionar projeto"}</Text>
        <Text variant="tertiary">▾</Text>
      </Pressable>
      <OptionSheet
        visible={open}
        title="Projeto"
        selected={current?.id}
        onSelect={(v) => onSelect(String(v))}
        onClose={() => setOpen(false)}
        options={projects.map((p) => ({
          value: p.id,
          label: p.name,
          description: p.identifier,
          accessory: (
            <Row>
              <Text variant="tertiary">{p.identifier}</Text>
            </Row>
          ),
        }))}
      />
    </>
  );
}
