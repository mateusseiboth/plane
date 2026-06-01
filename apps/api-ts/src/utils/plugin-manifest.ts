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

export interface ValidatedPluginManifest {
  name: string;
  slug: string;
  version: string;
  author: string;
  description: string;
  entry: string;
  permissions: string[];
  contributions: PluginContributions;
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
      throw Object.assign(new Error(`manifest.json: contributions.sidebar[${idx}] must be an object.`), { status: 400 });
    }
    if (!item.label || typeof item.label !== "string") {
      throw Object.assign(new Error(`manifest.json: contributions.sidebar[${idx}].label is required.`), { status: 400 });
    }
    if (!item.page || typeof item.page !== "string") {
      throw Object.assign(new Error(`manifest.json: contributions.sidebar[${idx}].page is required.`), { status: 400 });
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
      throw Object.assign(new Error(`manifest.json: contributions.pages[${idx}] must be an object.`), { status: 400 });
    }
    if (!item.path || typeof item.path !== "string") {
      throw Object.assign(new Error(`manifest.json: contributions.pages[${idx}].path is required.`), { status: 400 });
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
        new Error(`manifest.json: missing or invalid field "${field}".`),
        { status: 400 }
      );
    }
  }

  const version = raw.version as string;
  if (!SEMVER_RE.test(version)) {
    throw Object.assign(
      new Error(`manifest.json: version must follow semver (major.minor.patch), got "${version}".`),
      { status: 400 }
    );
  }

  const name = (raw.name as string).trim().slice(0, 255);
  let slug = typeof raw.slug === "string" && raw.slug ? slugify(raw.slug) : slugify(name);
  if (!slug) slug = `plugin-${Date.now()}`;
  if (!SLUG_RE.test(slug)) {
    throw Object.assign(
      new Error(`manifest.json: slug "${slug}" is invalid (use lowercase letters, numbers and dashes).`),
      { status: 400 }
    );
  }

  const permissions: string[] = Array.isArray(raw.permissions) ? raw.permissions : [];
  const invalid = permissions.filter((p) => !VALID_PLUGIN_PERMISSIONS.has(p));
  if (invalid.length) {
    throw Object.assign(
      new Error(`manifest.json: unknown permissions: ${invalid.join(", ")}.`),
      { status: 400 }
    );
  }

  const contributions = validateContributions(raw.contributions);

  // A sidebar item must point at a declared page.
  const declaredPages = new Set(contributions.pages.map((p) => p.path));
  for (const item of contributions.sidebar) {
    if (!declaredPages.has(item.page)) {
      throw Object.assign(
        new Error(`manifest.json: sidebar item "${item.label}" points at page "${item.page}" which is not declared in contributions.pages.`),
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
  };
}
