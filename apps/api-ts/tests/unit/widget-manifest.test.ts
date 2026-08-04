import { describe, it, expect } from "bun:test";
import { validateManifest } from "../../src/utils/widget-manifest";

const VALID = {
  name: "My Widget",
  version: "2.3.1",
  author: "Dev Team",
  entry: "widget.js",
  permissions: ["worker-items.read", "stats.read"],
  description: "A test widget",
};

describe("validateManifest", () => {
  it("returns a validated manifest for valid input", () => {
    const result = validateManifest(VALID);
    expect(result.name).toBe("My Widget");
    expect(result.version).toBe("2.3.1");
    expect(result.permissions).toEqual(["worker-items.read", "stats.read"]);
  });

  it("throws 400 when name is missing", () => {
    const { name, ...rest } = VALID;
    expect(() => validateManifest(rest as any)).toThrow('"name"');
  });

  it("throws 400 when version is missing", () => {
    const { version, ...rest } = VALID;
    expect(() => validateManifest(rest as any)).toThrow('"version"');
  });

  it("throws 400 when version does not follow semver", () => {
    expect(() => validateManifest({ ...VALID, version: "v1.0" })).toThrow("semver");
    expect(() => validateManifest({ ...VALID, version: "1.0" })).toThrow("semver");
    expect(() => validateManifest({ ...VALID, version: "latest" })).toThrow("semver");
  });

  it("accepts version with three numeric parts", () => {
    const result = validateManifest({ ...VALID, version: "0.0.1" });
    expect(result.version).toBe("0.0.1");
  });

  it("throws 400 for unknown permissions", () => {
    expect(() => validateManifest({ ...VALID, permissions: ["unknown.perm"] })).toThrow("permissões desconhecidas");
  });

  it("accepts empty permissions array", () => {
    const result = validateManifest({ ...VALID, permissions: [] });
    expect(result.permissions).toEqual([]);
  });

  it("truncates name longer than 255 chars", () => {
    const longName = "a".repeat(300);
    const result = validateManifest({ ...VALID, name: longName });
    expect(result.name.length).toBe(255);
  });
});
