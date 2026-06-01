import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";

import {
  ColorScheme,
  darkColors,
  fontSize,
  lightColors,
  radius,
  spacing,
} from "./colors";

export type ThemeMode = "light" | "dark" | "system";

export type Theme = {
  mode: "light" | "dark";
  colors: ColorScheme;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
};

type ThemeContextValue = Theme & {
  preference: ThemeMode;
  setPreference: (mode: ThemeMode) => void;
};

const STORAGE_KEY = "aviao.theme.preference";

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setPreferenceState(v);
    });
  }, []);

  const setPreference = (mode: ThemeMode) => {
    setPreferenceState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  };

  const resolved: "light" | "dark" =
    preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode: resolved,
      colors: resolved === "dark" ? darkColors : lightColors,
      spacing,
      radius,
      fontSize,
      preference,
      setPreference,
    }),
    [resolved, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
