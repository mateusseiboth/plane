import { describe, it, expect } from "bun:test";
import { validatePluginManifest } from "../../src/utils/plugin-manifest";

const VALID = {
  name: "Sales Dashboard",
  slug: "sales-dashboard",
  version: "2.3.1",
  author: "Dev Team",
  entry: "plugin.js",
  permissions: ["worker-items.read", "ui.sidebar", "ui.pages"],
  description: "A test plugin",
  contributions: {
    pages: [{ path: "dashboard", title: "Sales Dashboard", component: "default" }],
    sidebar: [{ id: "sales", label: "Sales", icon: "BarChart3", page: "dashboard", order: 10 }],
  },
};

describe("validatePluginManifest", () => {
  it("returns a validated manifest for valid input", () => {
    const result = validatePluginManifest(VALID);
    expect(result.name).toBe("Sales Dashboard");
    expect(result.slug).toBe("sales-dashboard");
    expect(result.version).toBe("2.3.1");
    expect(result.permissions).toContain("ui.sidebar");
    expect(result.contributions.pages).toHaveLength(1);
    expect(result.contributions.sidebar[0].page).toBe("dashboard");
  });

  it("derives a slug from the name when omitted", () => {
    const { slug, ...rest } = VALID;
    const result = validatePluginManifest(rest as any);
    expect(result.slug).toBe("sales-dashboard");
  });

  it("throws 400 when name is missing", () => {
    const { name, ...rest } = VALID;
    expect(() => validatePluginManifest(rest as any)).toThrow('"name"');
  });

  it("throws 400 when version does not follow semver", () => {
    expect(() => validatePluginManifest({ ...VALID, version: "v1.0" })).toThrow("semver");
  });

  it("throws 400 for unknown permissions", () => {
    expect(() => validatePluginManifest({ ...VALID, permissions: ["unknown.perm"] })).toThrow("permissões desconhecidas");
  });

  it("throws when a sidebar item points at an undeclared page", () => {
    const broken = {
      ...VALID,
      contributions: {
        pages: [{ path: "dashboard", title: "Dashboard" }],
        sidebar: [{ id: "x", label: "X", page: "missing" }],
      },
    };
    expect(() => validatePluginManifest(broken)).toThrow("não está declarada");
  });

  it("accepts a manifest with no contributions", () => {
    const { contributions, ...rest } = VALID;
    const result = validatePluginManifest(rest as any);
    expect(result.contributions.pages).toEqual([]);
    expect(result.contributions.sidebar).toEqual([]);
  });

  it("truncates name longer than 255 chars", () => {
    const longName = "a".repeat(300);
    const result = validatePluginManifest({ ...VALID, name: longName, slug: "x" });
    expect(result.name.length).toBe(255);
  });

  it("throws when a required field is present but not a string", () => {
    expect(() => validatePluginManifest({ ...VALID, entry: 42 } as any)).toThrow('"entry"');
    expect(() => validatePluginManifest({ ...VALID, author: "" } as any)).toThrow('"author"');
  });

  it("sanitises a slug with invalid characters instead of rejecting it", () => {
    expect(validatePluginManifest({ ...VALID, slug: "Sales_Dashboard!!" }).slug).toBe("sales-dashboard");
  });

  it("falls back to a generated slug when the name yields nothing", () => {
    const result = validatePluginManifest({ ...VALID, name: "!!!", slug: "" });
    expect(result.slug).toMatch(/^plugin-\d+$/);
  });

  it("defaults description to an empty string and trims author/entry", () => {
    const { description, ...rest } = VALID;
    const result = validatePluginManifest({ ...rest, author: "  Dev Team  ", entry: " plugin.js " });
    expect(result.description).toBe("");
    expect(result.author).toBe("Dev Team");
    expect(result.entry).toBe("plugin.js");
  });
});

describe("contributions", () => {
  it("derives the sidebar id from the label and defaults order/page", () => {
    const result = validatePluginManifest({
      ...VALID,
      contributions: {
        pages: [{ path: "/dashboard" }],
        sidebar: [{ label: "Sales Report", page: "/dashboard" }],
      },
    });
    expect(result.contributions.sidebar[0].id).toBe("sales-report");
    expect(result.contributions.sidebar[0].order).toBe(0);
    // O `/` inicial é removido dos dois lados, senão o item nunca casa com a página.
    expect(result.contributions.sidebar[0].page).toBe("dashboard");
    expect(result.contributions.pages[0].path).toBe("dashboard");
    expect(result.contributions.pages[0].title).toBe("/dashboard");
    expect(result.contributions.pages[0].component).toBe("default");
  });

  it("rejects malformed contribution entries", () => {
    const base = { pages: [{ path: "dashboard" }] };
    expect(() =>
      validatePluginManifest({ ...VALID, contributions: { ...base, sidebar: ["nope"] } })
    ).toThrow("deve ser um objeto");
    expect(() =>
      validatePluginManifest({ ...VALID, contributions: { ...base, sidebar: [{ page: "dashboard" }] } })
    ).toThrow(".label é obrigatório");
    expect(() =>
      validatePluginManifest({ ...VALID, contributions: { ...base, sidebar: [{ label: "X" }] } })
    ).toThrow(".page é obrigatório");
    expect(() => validatePluginManifest({ ...VALID, contributions: { pages: [null] } })).toThrow(
      "deve ser um objeto"
    );
    expect(() => validatePluginManifest({ ...VALID, contributions: { pages: [{ title: "sem path" }] } })).toThrow(
      ".path é obrigatório"
    );
  });

  it("ignores contributions that are not objects/arrays", () => {
    const result = validatePluginManifest({ ...VALID, contributions: "nope" });
    expect(result.contributions).toEqual({ sidebar: [], pages: [] });
  });
});

describe("configSchema (G1)", () => {
  it("normalises fields and defaults the type to string", () => {
    const result = validatePluginManifest({
      ...VALID,
      configSchema: [
        { key: "endpoint", label: "Endpoint", type: "tipo-invalido", required: true },
        { key: "token", type: "secret" },
        { key: "mode", type: "select", options: [{ value: "a" }, { label: "B", value: "b" }, { value: 1 }] },
      ],
    });
    expect(result.configSchema[0].type).toBe("string");
    expect(result.configSchema[0].required).toBe(true);
    // secret implica secret=true mesmo sem o campo explícito
    expect(result.configSchema[1].type).toBe("secret");
    expect(result.configSchema[1].secret).toBe(true);
    expect(result.configSchema[1].label).toBe("token");
    // opções sem `value` string são descartadas
    expect(result.configSchema[2].options).toEqual([
      { label: "a", value: "a" },
      { label: "B", value: "b" },
    ]);
  });

  it("defaults to an empty schema and rejects a non-array", () => {
    expect(validatePluginManifest(VALID).configSchema).toEqual([]);
    expect(validatePluginManifest({ ...VALID, configSchema: null }).configSchema).toEqual([]);
    expect(() => validatePluginManifest({ ...VALID, configSchema: {} })).toThrow("deve ser um array");
  });

  it("requires a key on every field", () => {
    expect(() => validatePluginManifest({ ...VALID, configSchema: [{ label: "sem key" }] })).toThrow(
      "configSchema[0].key é obrigatório"
    );
  });
});

describe("definedPermissions (G2)", () => {
  it("accepts keys namespaced by the slug or its compact form", () => {
    const result = validatePluginManifest({
      ...VALID,
      definedPermissions: [
        { key: "sales-dashboard.export", label: "Exportar" },
        { key: "salesdashboard.import" },
      ],
    });
    expect(result.definedPermissions[0].label).toBe("Exportar");
    expect(result.definedPermissions[1].label).toBe("salesdashboard.import");
  });

  it("rejects keys outside the plugin namespace", () => {
    expect(() =>
      validatePluginManifest({ ...VALID, definedPermissions: [{ key: "outro.plugin.read" }] })
    ).toThrow("deve ter o slug do plugin como prefixo");
  });

  it("defaults to empty and rejects malformed input", () => {
    expect(validatePluginManifest(VALID).definedPermissions).toEqual([]);
    expect(() => validatePluginManifest({ ...VALID, definedPermissions: "x" })).toThrow("deve ser um array");
    expect(() => validatePluginManifest({ ...VALID, definedPermissions: [{ label: "sem key" }] })).toThrow(
      "definedPermissions[0].key é obrigatório"
    );
  });
});

describe("backend (G3)", () => {
  it("normalises baseUrl and keeps healthPath", () => {
    const result = validatePluginManifest({
      ...VALID,
      backend: { baseUrl: "https://api.exemplo.com/", healthPath: "/health" },
    });
    expect(result.backend).toEqual({ baseUrl: "https://api.exemplo.com", healthPath: "/health" });
  });

  it("omits healthPath when not a string", () => {
    const result = validatePluginManifest({ ...VALID, backend: { baseUrl: "https://api.exemplo.com", healthPath: 1 } });
    expect(result.backend?.healthPath).toBeUndefined();
  });

  it("defaults to null and validates the URL", () => {
    expect(validatePluginManifest(VALID).backend).toBeNull();
    expect(() => validatePluginManifest({ ...VALID, backend: "https://x" })).toThrow("deve ser um objeto");
    expect(() => validatePluginManifest({ ...VALID, backend: {} })).toThrow("baseUrl é obrigatório");
    expect(() => validatePluginManifest({ ...VALID, backend: { baseUrl: "não-é-url" } })).toThrow(
      "não é uma URL válida"
    );
  });
});
