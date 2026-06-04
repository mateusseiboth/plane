import { sdkRequest } from "../http";
import type { PluginConfigField, ConfigScope } from "../types";

// G1 — per-instance plugin configuration. Persisted server-side, isolated by
// plugin and by scope (workspace by default, or instance-wide for admins).
// Generic: any plugin declares `configSchema` in its manifest and gets CRUD + a
// host-rendered settings form for free. Secret fields are never returned in clear.

export const configApi = {
  /** The config field schema declared by the plugin manifest. */
  getSchema(): Promise<PluginConfigField[]> {
    return sdkRequest<PluginConfigField[]>("/config/schema", { method: "GET" });
  },

  /** Effective config values for a scope (default: current workspace). */
  get<T extends Record<string, unknown> = Record<string, unknown>>(scope?: ConfigScope): Promise<T> {
    return sdkRequest<T>("/config", { method: "GET", query: { scope } });
  },

  /** Persist config values (server enforces admin). Secret fields kept if omitted. */
  set(values: Record<string, unknown>, scope?: ConfigScope): Promise<void> {
    return sdkRequest<void>("/config", { method: "PUT", body: { values, scope } });
  },
};
