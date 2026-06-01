import type { PageComponent, PageDefinition } from "../types";

// A plugin bundle can register page components at runtime. The host reads this
// registry (in addition to the manifest's declared pages) to mount full routes.
const _registry = new Map<string, PageComponent>();

export const pagesApi = {
  /** Register a React component for a given page path. */
  register(path: string, component: PageComponent, meta?: Omit<PageDefinition, "path" | "component">) {
    const normalized = path.replace(/^\/+/, "");
    _registry.set(normalized, component);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("plugin:pages", {
          detail: { source: "plugin-sdk", event: "page:register", path: normalized, title: meta?.title ?? normalized },
        })
      );
    }
    return component;
  },

  /** Resolve a registered page component. */
  get(path: string): PageComponent | undefined {
    return _registry.get(path.replace(/^\/+/, ""));
  },

  /** List every registered page path. */
  list(): string[] {
    return [..._registry.keys()];
  },
};
