import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";

import { ApiError } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { Button, Input, Logo, Screen, Text } from "@/components";
import { useTheme } from "@/theme";

export default function LoginScreen() {
  const { signIn, serverUrl } = useAuth();
  const { spacing, colors } = useTheme();
  const [server, setServer] = useState(serverUrl);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(server, email.trim(), password);
    } catch (e) {
      console.error("[login] sign-in failed", e);
      setError(e instanceof ApiError ? e.detail : "Não foi possível entrar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, gap: spacing.xl, justifyContent: "center" }}>
        <View style={{ alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg }}>
          <Logo size="lg" />
          <Text variant="secondary">Gestão de chamados e visitas técnicas</Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption">Servidor</Text>
            <Input
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://aviao.suaempresa.com"
            />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption">E-mail</Text>
            <Input
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="voce@empresa.com"
            />
          </View>
          <View style={{ gap: spacing.xs }}>
            <Text variant="caption">Senha</Text>
            <Input value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          </View>

          {error ? <Text color={colors.danger}>{error}</Text> : null}

          <Button title="Entrar" onPress={onSubmit} loading={loading} disabled={!server.trim() || !email || !password} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
