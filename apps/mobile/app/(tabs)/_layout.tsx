import { Tabs } from "expo-router";
import React from "react";
import { Text } from "react-native";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useTheme } from "@/theme";

function TabIcon({ icon, color }: { icon: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}

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
        options={{ title: "Início", tabBarIcon: ({ color }) => <TabIcon icon="⌂" color={color} /> }}
      />
      <Tabs.Screen
        name="work-items"
        options={{ title: "Work Items", tabBarIcon: ({ color }) => <TabIcon icon="◫" color={color} /> }}
      />
      <Tabs.Screen
        name="intake"
        options={{ title: "Intake", tabBarIcon: ({ color }) => <TabIcon icon="✉" color={color} /> }}
      />
      <Tabs.Screen
        name="visits"
        options={{ title: "Visitas", tabBarIcon: ({ color }) => <TabIcon icon="✈" color={color} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: "Mais", tabBarIcon: ({ color }) => <TabIcon icon="⋯" color={color} /> }}
      />
    </Tabs>
  );
}
