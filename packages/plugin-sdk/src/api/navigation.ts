import type { SidebarItem } from "../types";

let _pluginId = "";

export function configureNavigation(pluginId: string) {
  _pluginId = pluginId;
}

function emit(event: string, detail: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const payload = { source: "plugin-sdk", pluginId: _pluginId, event, ...detail };
  window.dispatchEvent(new CustomEvent("plugin:navigation", { detail: payload }));
  // Also bubble to the host frame in case the plugin runs inside an iframe.
  window.parent?.postMessage(payload, "*");
}

/**
 * Runtime navigation surface for plugins.
 *
 * Sidebar items can be declared statically in `manifest.json`
 * (`contributions.sidebar`) — which the host renders automatically — OR
 * registered dynamically at runtime through `navigation.addSidebarItem`.
 */
export const navigationApi = {
  /** Register (or replace) a sidebar item at runtime. */
  addSidebarItem(item: SidebarItem) {
    emit("sidebar:add", { item });
    return {
      remove: () => emit("sidebar:remove", { id: item.id }),
    };
  },

  /** Remove a previously-registered sidebar item by id. */
  removeSidebarItem(id: string) {
    emit("sidebar:remove", { id });
  },

  /** Navigate the host app to one of this plugin's pages. */
  goToPage(page: string, query?: Record<string, string>) {
    emit("navigate", { page, query: query ?? {} });
  },

  /** Navigate the host app to an arbitrary in-app path. */
  navigate(path: string) {
    emit("navigate:path", { path });
  },
};
