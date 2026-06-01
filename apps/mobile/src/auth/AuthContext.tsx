import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, endpoints, Me, setTokenGetter, Workspace } from "@/api";
import { activeWorkspaceStore, tokenStore } from "./storage";

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
  signIn: (email: string, password: string) => Promise<void>;
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

  // Restore session on launch.
  useEffect(() => {
    (async () => {
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
    async (email: string, password: string) => {
      const res = await endpoints.auth.signIn(email, password);
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
      signIn,
      signOut,
      setActiveWorkspace,
      refresh,
    }),
    [status, me, token, workspaces, activeWorkspace, workspaceRole, projectRoles, signIn, signOut, setActiveWorkspace, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
