import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { endpoints, Project } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { cacheGet, cacheSet } from "@/offline/storage";

const KEY = (slug: string) => `aviao.currentProject.${slug}`;

/**
 * Loads the active workspace's projects (cached for offline) and tracks a
 * "current project" selection, persisted per workspace.
 */
export function useCurrentProject() {
  const { activeWorkspace } = useAuth();
  const slug = activeWorkspace?.slug;
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    (async () => {
      setLoading(true);
      const cached = await cacheGet<Project[]>(`projects.${slug}`);
      if (cached && active) setProjects(cached);
      try {
        const fresh = await endpoints.workspaces.projects(slug);
        if (active) {
          setProjects(fresh);
          await cacheSet(`projects.${slug}`, fresh);
        }
      } catch {
        /* offline: keep cached */
      }
      const saved = await AsyncStorage.getItem(KEY(slug));
      if (active) setCurrentId(saved ?? null);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [slug]);

  const setCurrent = useCallback(
    async (projectId: string) => {
      setCurrentId(projectId);
      if (slug) await AsyncStorage.setItem(KEY(slug), projectId);
    },
    [slug],
  );

  const current = projects.find((p) => p.id === currentId) ?? projects[0] ?? null;

  return { slug, projects, current, currentId: current?.id ?? null, setCurrent, loading };
}
