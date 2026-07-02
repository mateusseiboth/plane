/**
 * Token persistence. The JWT lives in the OS keychain via expo-secure-store;
 * when the keychain is unavailable it falls back to a local SQLite key-value
 * table. Non-sensitive UI state (active workspace slug, server URL) lives in
 * AsyncStorage.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

const TOKEN_KEY = "aviao.auth.token";
const WORKSPACE_KEY = "aviao.active.workspace";
const SERVER_URL_KEY = "aviao.server.url";

type KeyValueStore = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const secureStore: KeyValueStore = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

const sqliteStore: KeyValueStore = (() => {
  let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
  const getDb = () => {
    dbPromise ??= SQLite.openDatabaseAsync("aviao-auth.db").then(async (db) => {
      await db.execAsync("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
      return db;
    });
    return dbPromise;
  };
  return {
    async get(key) {
      const db = await getDb();
      const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM kv WHERE key = ?", key);
      return row?.value ?? null;
    },
    async set(key, value) {
      const db = await getDb();
      await db.runAsync("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", key, value);
    },
    async remove(key) {
      const db = await getDb();
      await db.runAsync("DELETE FROM kv WHERE key = ?", key);
    },
  };
})();

let backendPromise: Promise<KeyValueStore> | null = null;
function resolveTokenBackend(): Promise<KeyValueStore> {
  backendPromise ??= SecureStore.isAvailableAsync()
    .then((available) => (available ? secureStore : sqliteStore))
    .catch(() => sqliteStore);
  return backendPromise;
}

export const tokenStore = {
  async get(): Promise<string | null> {
    try {
      const backend = await resolveTokenBackend();
      return await backend.get(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string): Promise<void> {
    const backend = await resolveTokenBackend();
    await backend.set(TOKEN_KEY, token);
  },
  async clear(): Promise<void> {
    const backend = await resolveTokenBackend();
    await backend.remove(TOKEN_KEY).catch(() => {});
  },
};

export const activeWorkspaceStore = {
  get: () => AsyncStorage.getItem(WORKSPACE_KEY),
  set: (slug: string) => AsyncStorage.setItem(WORKSPACE_KEY, slug),
  clear: () => AsyncStorage.removeItem(WORKSPACE_KEY),
};

export const serverUrlStore = {
  get: () => AsyncStorage.getItem(SERVER_URL_KEY),
  set: (url: string) => AsyncStorage.setItem(SERVER_URL_KEY, url),
  clear: () => AsyncStorage.removeItem(SERVER_URL_KEY),
};
