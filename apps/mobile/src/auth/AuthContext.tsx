import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, endpoints, Me, normalizeServerUrl, resolveBaseUrl, setBaseUrl, setTokenGetter, Workspace } from "@/api";
import { activeWorkspaceStore, serverUrlStore, tokenStore } from "./storage";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  me: Me | null;
  token: string | null;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  /** Current user's role in the active workspace (mirror of backend role number). */
  workspaceRole: number | null;
  /** projectId → role for the active workspace (granular SAC roles). */
  projectRoles: Record<string, number>;
  /** Server base URL used by the api client (persisted after a successful sign-in). */
  serverUrl: string;
  signIn: (serverUrl: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setActiveWorkspace: (slug: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [workspaceRole, setWorkspaceRole] = useState<number | null>(null);
  const [projectRoles, setProjectRoles] = useState<Record<string, number>>({});
  const [serverUrl, setServerUrl] = useState<string>(resolveBaseUrl());

  // Keep the live token in a ref so the api client reads the latest value.
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  useEffect(() => {
    setTokenGetter(() => tokenRef.current);
  }, []);

  const loadWorkspaceRole = useCallback(async (slug: string) => {
    try {
      const [member, roles] = await Promise.all([
        endpoints.workspaces.me(slug).catch(() => null),
        endpoints.users.projectRoles(slug).catch(() => ({})),
      ]);
      setWorkspaceRole(member?.role ?? null);
      setProjectRoles(roles ?? {});
    } catch {
      setWorkspaceRole(null);
      setProjectRoles({});
    }
  }, []);

  const bootstrap = useCallback(
    async (existingToken: string) => {
      setToken(existingToken);
      tokenRef.current = existingToken;
      const meData = await endpoints.users.me();
      setMe(meData);
      const ws = await endpoints.users.workspaces().catch(() => []);
      setWorkspaces(ws);

      const savedSlug = await activeWorkspaceStore.get();
      const active = ws.find((w) => w.slug === savedSlug) ?? ws[0] ?? null;
      setActiveWorkspaceState(active);
      if (active) {
        await activeWorkspaceStore.set(active.slug);
        await loadWorkspaceRole(active.slug);
      }
      setStatus("authenticated");
    },
    [loadWorkspaceRole],
  );

  // Restore session on launch (server URL first so requests hit the right host).
  useEffect(() => {
    (async () => {
      const savedUrl = await serverUrlStore.get();
      if (savedUrl) {
        setBaseUrl(savedUrl);
        setServerUrl(resolveBaseUrl());
      }
      const saved = await tokenStore.get();
      if (!saved) {
        setStatus("unauthenticated");
        return;
      }
      try {
        await bootstrap(saved);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) await tokenStore.clear();
        setStatus("unauthenticated");
      }
    })();
  }, [bootstrap]);

  const signIn = useCallback(
    async (server: string, email: string, password: string) => {
      const url = normalizeServerUrl(server);
      setBaseUrl(url);
      const res = await endpoints.auth.signIn(email, password);
      if (!res?.token) {
        throw new ApiError(0, "O servidor não retornou um token de acesso. Verifique a URL do servidor.", res);
      }
      await serverUrlStore.set(url);
      setServerUrl(url);
      await tokenStore.set(res.token);
      await bootstrap(res.token);
    },
    [bootstrap],
  );

  const signOut = useCallback(async () => {
    await endpoints.auth.signOut().catch(() => {});
    await tokenStore.clear();
    setToken(null);
    tokenRef.current = null;
    setMe(null);
    setWorkspaces([]);
    setActiveWorkspaceState(null);
    setWorkspaceRole(null);
    setProjectRoles({});
    setStatus("unauthenticated");
  }, []);

  const setActiveWorkspace = useCallback(
    async (slug: string) => {
      const ws = workspaces.find((w) => w.slug === slug);
      if (!ws) return;
      setActiveWorkspaceState(ws);
      await activeWorkspaceStore.set(slug);
      await loadWorkspaceRole(slug);
    },
    [workspaces, loadWorkspaceRole],
  );

  const refresh = useCallback(async () => {
    if (token) await bootstrap(token);
  }, [token, bootstrap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      token,
      workspaces,
      activeWorkspace,
      workspaceRole,
      projectRoles,
      serverUrl,
      signIn,
      signOut,
      setActiveWorkspace,
      refresh,
    }),
    [status, me, token, workspaces, activeWorkspace, workspaceRole, projectRoles, serverUrl, signIn, signOut, setActiveWorkspace, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
