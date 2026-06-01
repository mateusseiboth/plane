import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { Loading } from "@/components/ui";
import { SyncProvider } from "@/offline/SyncProvider";
import { ThemeProvider, useTheme } from "@/theme";

function ThemedStatusBar() {
  const { mode } = useTheme();
  return <StatusBar style={mode === "dark" ? "light" : "dark"} />;
}

/** Redirects between the auth flow and the app based on session status. */
function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (status === "loading") return;
    const inAuthGroup = segments[0] === "(auth)";
    if (status === "unauthenticated" && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (status === "authenticated" && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [status, segments, router]);

  if (status === "loading") return <Loading label="Carregando…" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.primary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="work-item/[id]" options={{ title: "Work Item" }} />
      <Stack.Screen name="work-item/new" options={{ title: "Novo Work Item", presentation: "modal" }} />
      <Stack.Screen name="intake/[id]" options={{ title: "Intake" }} />
      <Stack.Screen name="visit/[id]" options={{ title: "Visita Técnica" }} />
      <Stack.Screen name="visit/new" options={{ title: "Nova Visita", presentation: "modal" }} />
      <Stack.Screen name="wiki/index" options={{ title: "Wiki" }} />
      <Stack.Screen name="wiki/[id]" options={{ title: "Página" }} />
      <Stack.Screen name="search" options={{ title: "Buscar", presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <SyncProvider>
              <ThemedStatusBar />
              <AuthGate />
            </SyncProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
