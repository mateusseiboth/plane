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
    expect(() => validatePluginManifest({ ...VALID, permissions: ["unknown.perm"] })).toThrow("unknown permissions");
  });

  it("throws when a sidebar item points at an undeclared page", () => {
    const broken = {
      ...VALID,
      contributions: {
        pages: [{ path: "dashboard", title: "Dashboard" }],
        sidebar: [{ id: "x", label: "X", page: "missing" }],
      },
    };
    expect(() => validatePluginManifest(broken)).toThrow("not declared");
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
});
