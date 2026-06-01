/**
 * Placeholder brand mark for Avião. Intentionally NOT using any Plane logo or
 * brand asset — this is a simple typographic + glyph placeholder you can swap
 * for real artwork later.
 */
import React from "react";
import { View } from "react-native";

import { useTheme } from "@/theme";
import { Text } from "./ui";

export function Logo({ size = "md", showWordmark = true }: { size?: "sm" | "md" | "lg"; showWordmark?: boolean }) {
  const { colors, radius } = useTheme();
  const dim = size === "lg" ? 56 : size === "sm" ? 28 : 40;
  const glyph = size === "lg" ? 30 : size === "sm" ? 16 : 22;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: dim,
          height: dim,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Paper-plane glyph as a placeholder mark */}
        <Text style={{ fontSize: glyph, color: colors.onPrimary }}>✈</Text>
      </View>
      {showWordmark && (
        <Text variant={size === "lg" ? "title" : "heading"} weight="bold">
          Avião
        </Text>
      )}
    </View>
  );
}
