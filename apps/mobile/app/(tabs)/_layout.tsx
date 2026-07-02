import { Tabs } from "expo-router";
import { Ellipsis, Home, Inbox, LayoutGrid, Plane } from "lucide-react-native";
import React from "react";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useTheme } from "@/theme";

export default function TabsLayout() {
  const { colors } = useTheme();
  // Urgent-ticket notifications run while the authenticated tab UI is mounted.
  usePushNotifications();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Início", tabBarIcon: ({ color }) => <Home size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="work-items"
        options={{ title: "Work Items", tabBarIcon: ({ color }) => <LayoutGrid size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="intake"
        options={{ title: "Intake", tabBarIcon: ({ color }) => <Inbox size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="visits"
        options={{ title: "Visitas", tabBarIcon: ({ color }) => <Plane size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: "Mais", tabBarIcon: ({ color }) => <Ellipsis size={22} color={color} /> }}
      />
    </Tabs>
  );
}
