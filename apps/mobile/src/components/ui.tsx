/**
 * Themed UI primitives. Everything reads from useTheme() so light/dark switches
 * are automatic. These are the building blocks every screen composes.
 */
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  TextInputProps,
  TextProps as RNTextProps,
  View,
  ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme";

type Variant = "title" | "heading" | "body" | "secondary" | "tertiary" | "caption" | "mono";

export function Text({
  variant = "body",
  weight,
  color,
  style,
  ...rest
}: RNTextProps & { variant?: Variant; weight?: "regular" | "medium" | "bold"; color?: string }) {
  const { colors, fontSize } = useTheme();
  const map: Record<Variant, { size: number; color: string; weight: "400" | "500" | "700" }> = {
    title: { size: fontSize.xxl, color: colors.text, weight: "700" },
    heading: { size: fontSize.lg, color: colors.text, weight: "700" },
    body: { size: fontSize.md, color: colors.text, weight: "400" },
    secondary: { size: fontSize.sm, color: colors.textSecondary, weight: "400" },
    tertiary: { size: fontSize.xs, color: colors.textTertiary, weight: "400" },
    caption: { size: fontSize.xs, color: colors.textSecondary, weight: "500" },
    mono: { size: fontSize.sm, color: colors.text, weight: "500" },
  };
  const v = map[variant];
  const fw = weight === "bold" ? "700" : weight === "medium" ? "500" : weight === "regular" ? "400" : v.weight;
  return (
    <RNText
      style={[
        { fontSize: v.size, color: color ?? v.color, fontWeight: fw },
        variant === "mono" && { fontFamily: "monospace" },
        style,
      ]}
      {...rest}
    />
  );
}

export function Screen({
  children,
  scroll,
  padded = true,
  refreshControl,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement;
  style?: ViewProps["style"];
}) {
  const { colors, spacing } = useTheme();
  const inner = (
    <View style={[{ flex: 1 }, padded && { padding: spacing.lg, gap: spacing.md }, style]}>{children}</View>
  );
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingBottom: spacing.xxl }}
          refreshControl={refreshControl}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

export function Card({ style, ...rest }: ViewProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.lg,
          gap: spacing.sm,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: PressableProps["style"];
}) {
  const { colors, radius, spacing, fontSize } = useTheme();
  const bg =
    variant === "primary" ? colors.primary : variant === "danger" ? colors.danger : variant === "secondary" ? colors.surfaceElevated : "transparent";
  const fg = variant === "primary" || variant === "danger" ? colors.onPrimary : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.sm,
          borderWidth: variant === "secondary" || variant === "ghost" ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style as object,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <RNText style={{ color: fg, fontSize: fontSize.md, fontWeight: "600" }}>{title}</RNText>
    </Pressable>
  );
}

export function IconButton({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: PressableProps["style"] }) {
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { padding: spacing.sm, borderRadius: radius.md, backgroundColor: pressed ? colors.surfaceSunken : "transparent" },
        style as object,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Input({ style, ...rest }: TextInputProps) {
  const { colors, radius, spacing, fontSize } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.textTertiary}
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          color: colors.text,
          fontSize: fontSize.md,
        },
        style,
      ]}
      {...rest}
    />
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Row({ children, gap, style, align = "center" }: { children: React.ReactNode; gap?: number; style?: ViewProps["style"]; align?: "center" | "flex-start" | "flex-end" | "space-between" }) {
  const { spacing } = useTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: align === "space-between" ? "space-between" : "flex-start", gap: gap ?? spacing.sm }, style]}>
      {children}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl }}>
      <ActivityIndicator color={colors.primary} />
      {label ? <Text variant="secondary">{label}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xxl }}>
      <Text variant="heading" style={{ textAlign: "center" }}>{title}</Text>
      {description ? <Text variant="secondary" style={{ textAlign: "center" }}>{description}</Text> : null}
      {action ? <View style={{ marginTop: spacing.md }}>{action}</View> : null}
    </View>
  );
}

export function Fab({ onPress, children }: { onPress?: () => void; children: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        position: "absolute",
        right: spacing.lg,
        bottom: spacing.xl,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.9 : 1,
        shadowColor: colors.shadow,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      })}
    >
      {children}
    </Pressable>
  );
}
