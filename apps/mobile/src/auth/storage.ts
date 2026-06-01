/**
 * Token persistence. The JWT lives in the OS keychain via expo-secure-store;
 * non-sensitive UI state (active workspace slug) lives in AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "aviao.auth.token";
const WORKSPACE_KEY = "aviao.active.workspace";

export const tokenStore = {
  async get(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
  },
};

export const activeWorkspaceStore = {
  get: () => AsyncStorage.getItem(WORKSPACE_KEY),
  set: (slug: string) => AsyncStorage.setItem(WORKSPACE_KEY, slug),
  clear: () => AsyncStorage.removeItem(WORKSPACE_KEY),
};
