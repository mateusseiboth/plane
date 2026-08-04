const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Plugins share the widget data-permissions and add UI-surface permissions.
export const VALID_PLUGIN_PERMISSIONS = new Set([
  // data (identical to widgets)
  "worker-items.read",
  "intakes.read",
  "actions.read",
  "stats.read",
  "users.read",
  "entities.read",
  // graphical surfaces unique to plugins
  "ui.sidebar",
  "ui.pages",
  "ui.modals",
  "ui.notifications",
  "ui.navigation",
  "storage.local",
]);

export interface PluginSidebarContribution {
  /** Stable id used for keys / dedup. */
  id: string;
  label: string;
  /** lucide-react icon name, optional. */
  icon?: string;
  /** Path of the page to open, relative to the plugin (e.g. "dashboard"). */
  page: string;
  /** Lower sorts first. */
  order?: number;
}

export interface PluginPageContribution {
  /** Path segment, relative to the plugin root (e.g. "dashboard"). */
  path: string;
  /** Human title rendered in the page header / document title. */
  title: string;
  /** Export name of the React component in the bundle (default: "default"). */
  component?: string;
}

export interface PluginContributions {
  sidebar: PluginSidebarContribution[];
  pages: PluginPageContribution[];
}

// G1/G2/G3 — generic plugin extension points (optional, additive).
export interface PluginConfigField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "headers" | "secret";
  group?: string;
  description?: string;
  secret?: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
  required?: boolean;
}

export interface PluginDefinedPermission {
  key: string;
  label: string;
  description?: string;
}

export interface PluginBackendManifest {
  baseUrl: string;
  healthPath?: string;
}

export interface ValidatedPluginManifest {
  name: string;
  slug: string;
  version: string;
  author: string;
  description: string;
  entry: string;
  permissions: string[];
  contributions: PluginContributions;
  /** G1 — declarative configuration schema (renders the settings form). */
  configSchema: PluginConfigField[];
  /** G2 — custom permissions this plugin defines (namespaced by slug). */
  definedPermissions: PluginDefinedPermission[];
  /** G3 — the plugin's own backend, reached via the gateway proxy. */
  backend: PluginBackendManifest | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 255);
}

function validateContributions(raw: unknown): PluginContributions {
  const contributions = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const rawSidebar = Array.isArray(contributions.sidebar) ? contributions.sidebar : [];
  const sidebar: PluginSidebarContribution[] = rawSidebar.map((item: any, idx: number) => {
    if (!item || typeof item !== "object") {
      throw Object.assign(new Error(`manifest.json: contributions.sidebar[${idx}] deve ser um objeto.`), { status: 400 });
    }
    if (!item.label || typeof item.label !== "string") {
      throw Object.assign(new Error(`manifest.json: contributions.sidebar[${idx}].label é obrigatório.`), { status: 400 });
    }
    if (!item.page || typeof item.page !== "string") {
      throw Object.assign(new Error(`manifest.json: contributions.sidebar[${idx}].page é obrigatório.`), { status: 400 });
    }
    return {
      id: typeof item.id === "string" && item.id ? slugify(item.id) : slugify(item.label),
      label: String(item.label).slice(0, 120),
      icon: typeof item.icon === "string" ? item.icon.slice(0, 60) : undefined,
      page: String(item.page).replace(/^\/+/, "").slice(0, 200),
      order: typeof item.order === "number" ? item.order : idx,
    };
  });

  const rawPages = Array.isArray(contributions.pages) ? contributions.pages : [];
  const pages: PluginPageContribution[] = rawPages.map((item: any, idx: number) => {
    if (!item || typeof item !== "object") {
      throw Object.assign(new Error(`manifest.json: contributions.pages[${idx}] deve ser um objeto.`), { status: 400 });
    }
    if (!item.path || typeof item.path !== "string") {
      throw Object.assign(new Error(`manifest.json: contributions.pages[${idx}].path é obrigatório.`), { status: 400 });
    }
    return {
      path: String(item.path).replace(/^\/+/, "").slice(0, 200),
      title: typeof item.title === "string" ? item.title.slice(0, 200) : String(item.path),
      component: typeof item.component === "string" ? item.component.slice(0, 120) : "default",
    };
  });

  return { sidebar, pages };
}

export function validatePluginManifest(raw: Record<string, unknown>): ValidatedPluginManifest {
  const required = ["name", "version", "author", "entry"] as const;
  for (const field of required) {
    if (!raw[field] || typeof raw[field] !== "string") {
      throw Object.assign(
        new Error(`manifest.json: campo "${field}" ausente ou inválido.`),
        { status: 400 }
      );
    }
  }

  const version = raw.version as string;
  if (!SEMVER_RE.test(version)) {
    throw Object.assign(
      new Error(`manifest.json: a versão deve seguir o padrão semver (major.minor.patch); recebido "${version}".`),
      { status: 400 }
    );
  }

  const name = (raw.name as string).trim().slice(0, 255);
  let slug = typeof raw.slug === "string" && raw.slug ? slugify(raw.slug) : slugify(name);
  if (!slug) slug = `plugin-${Date.now()}`;
  if (!SLUG_RE.test(slug)) {
    throw Object.assign(
      new Error(`manifest.json: o slug "${slug}" é inválido (use letras minúsculas, números e hifens).`),
      { status: 400 }
    );
  }

  const permissions: string[] = Array.isArray(raw.permissions) ? raw.permissions : [];
  const invalid = permissions.filter((p) => !VALID_PLUGIN_PERMISSIONS.has(p));
  if (invalid.length) {
    throw Object.assign(
      new Error(`manifest.json: permissões desconhecidas: ${invalid.join(", ")}.`),
      { status: 400 }
    );
  }

  const contributions = validateContributions(raw.contributions);
  const configSchema = validateConfigSchema(raw.configSchema);
  const definedPermissions = validateDefinedPermissions(raw.definedPermissions, slug);
  const backend = validateBackend(raw.backend);

  // A sidebar item must point at a declared page.
  const declaredPages = new Set(contributions.pages.map((p) => p.path));
  for (const item of contributions.sidebar) {
    if (!declaredPages.has(item.page)) {
      throw Object.assign(
        new Error(`manifest.json: o item de menu "${item.label}" aponta para a página "${item.page}", que não está declarada em contributions.pages.`),
        { status: 400 }
      );
    }
  }

  return {
    name,
    slug,
    version,
    author: (raw.author as string).trim().slice(0, 255),
    description: typeof raw.description === "string" ? raw.description.trim() : "",
    entry: (raw.entry as string).trim(),
    permissions,
    contributions,
    configSchema,
    definedPermissions,
    backend,
  };
}

// ── G1: config schema ──────────────────────────────────────────────────────────
const CONFIG_FIELD_TYPES = new Set(["string", "number", "boolean", "select", "headers", "secret"]);

function validateConfigSchema(raw: unknown): PluginConfigField[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error("manifest.json: configSchema deve ser um array."), { status: 400 });
  }
  return raw.map((item: any, idx: number) => {
    if (!item || typeof item !== "object" || !item.key || typeof item.key !== "string") {
      throw Object.assign(new Error(`manifest.json: configSchema[${idx}].key é obrigatório.`), { status: 400 });
    }
    const type = typeof item.type === "string" && CONFIG_FIELD_TYPES.has(item.type) ? item.type : "string";
    return {
      key: String(item.key).slice(0, 120),
      label: typeof item.label === "string" ? item.label.slice(0, 200) : String(item.key),
      type,
      group: typeof item.group === "string" ? item.group.slice(0, 120) : undefined,
      description: typeof item.description === "string" ? item.description.slice(0, 500) : undefined,
      secret: Boolean(item.secret) || type === "secret",
      default: item.default,
      options: Array.isArray(item.options)
        ? item.options
            .filter((o: any) => o && typeof o.value === "string")
            .map((o: any) => ({ label: String(o.label ?? o.value), value: String(o.value) }))
        : undefined,
      required: Boolean(item.required),
    };
  });
}

// ── G2: defined permissions (namespaced by the plugin slug) ─────────────────────
function validateDefinedPermissions(raw: unknown, slug: string): PluginDefinedPermission[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    throw Object.assign(new Error("manifest.json: definedPermissions deve ser um array."), { status: 400 });
  }
  const ns = slug.replace(/-/g, "");
  return raw.map((item: any, idx: number) => {
    if (!item || typeof item !== "object" || !item.key || typeof item.key !== "string") {
      throw Object.assign(new Error(`manifest.json: definedPermissions[${idx}].key é obrigatório.`), { status: 400 });
    }
    const key = String(item.key).slice(0, 120);
    // Must be namespaced by the plugin slug (or its compact form) to avoid clashes.
    const prefix = key.split(".")[0];
    if (prefix !== slug && prefix !== ns) {
      throw Object.assign(
        new Error(`manifest.json: definedPermissions[${idx}].key "${key}" deve ter o slug do plugin como prefixo ("${slug}.").`),
        { status: 400 }
      );
    }
    return {
      key,
      label: typeof item.label === "string" ? item.label.slice(0, 200) : key,
      description: typeof item.description === "string" ? item.description.slice(0, 500) : undefined,
    };
  });
}

// ── G3: backend declaration ─────────────────────────────────────────────────────
function validateBackend(raw: unknown): PluginBackendManifest | null {
  if (raw == null) return null;
  if (typeof raw !== "object") {
    throw Object.assign(new Error("manifest.json: backend deve ser um objeto."), { status: 400 });
  }
  const b = raw as Record<string, unknown>;
  if (!b.baseUrl || typeof b.baseUrl !== "string") {
    throw Object.assign(new Error("manifest.json: backend.baseUrl é obrigatório."), { status: 400 });
  }
  let baseUrl: string;
  try {
    baseUrl = new URL(b.baseUrl).toString().replace(/\/$/, "");
  } catch {
    throw Object.assign(new Error(`manifest.json: backend.baseUrl "${b.baseUrl}" não é uma URL válida.`), { status: 400 });
  }
  return {
    baseUrl,
    healthPath: typeof b.healthPath === "string" ? b.healthPath : undefined,
  };
}
