import { useEffect } from "react";
import { useLocalObservable } from "mobx-react";
import { pluginStore } from "@/store/plugin.store";

export function usePlugins(filters?: { name?: string; status?: string }) {
  const store = useLocalObservable(() => pluginStore);

  useEffect(() => {
    store.fetchPlugins(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    plugins: store.plugins,
    isLoading: store.isLoading,
    isUploading: store.isUploading,
    error: store.error,
    uploadPlugin: store.uploadPlugin.bind(store),
    activatePlugin: store.activatePlugin.bind(store),
    deactivatePlugin: store.deactivatePlugin.bind(store),
    removePlugin: store.removePlugin.bind(store),
    updatePlugin: store.updatePlugin.bind(store),
    refetch: () => store.fetchPlugins(filters),
  };
}

/** Active plugins (used by the sidebar / dynamic routing). */
export function useActivePlugins() {
  const store = useLocalObservable(() => pluginStore);

  useEffect(() => {
    if (!store.hasFetchedActive) store.fetchActivePlugins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    activePlugins: store.activePlugins,
    refetch: () => store.fetchActivePlugins(),
  };
}
