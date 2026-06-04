import { sdkRequest } from "../http";

// G2 — custom, plugin-defined permissions (RBAC). The plugin declares
// `definedPermissions` in its manifest; admins grant them to roles/users; this API
// resolves the effective permissions of the current user. Authorization is always
// re-enforced server-side (gateway + the plugin's own backend) — this is for UX.
//
// Pass `workspaceSlug` so role/user grants in that workspace are resolved (without
// it, only instance-admin ⇒ all is reflected).

let _cache: { key: string; list: string[]; at: number } | null = null;
const TTL = 30_000;

export const permissionsApi = {
  /** Effective permissions granted to the current user for this plugin. */
  async list(workspaceSlug?: string, force = false): Promise<string[]> {
    const key = workspaceSlug ?? "";
    if (!force && _cache && _cache.key === key && Date.now() - _cache.at < TTL) return _cache.list;
    const list = await sdkRequest<string[]>("/me/permissions", {
      method: "GET",
      query: workspaceSlug ? { workspace_slug: workspaceSlug } : undefined,
    });
    _cache = { key, list: Array.isArray(list) ? list : [], at: Date.now() };
    return _cache.list;
  },

  /** True if the current user has the given permission key. */
  async has(key: string, workspaceSlug?: string): Promise<boolean> {
    return (await permissionsApi.list(workspaceSlug)).includes(key);
  },

  /** Drop the in-memory cache (e.g. after an admin grant change). */
  invalidate(): void {
    _cache = null;
  },
};
