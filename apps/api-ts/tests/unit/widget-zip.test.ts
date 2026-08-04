import { describe, it, expect } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { extractWidgetZip } from "../../src/utils/widget-zip";

function makeZip(files: Record<string, string>): Buffer {
  const input: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    input[path] = strToU8(content);
  }
  return Buffer.from(zipSync(input));
}

const VALID_MANIFEST = JSON.stringify({
  name: "Test Widget",
  version: "1.0.0",
  author: "Tester",
  entry: "widget.js",
  permissions: ["worker-items.read"],
});

const VALID_BUNDLE = `export default function Widget(props) { return null; }`;

describe("extractWidgetZip", () => {
  it("extracts a valid ZIP with manifest.json and entry file", () => {
    const zip = makeZip({ "manifest.json": VALID_MANIFEST, "widget.js": VALID_BUNDLE });
    const result = extractWidgetZip(zip);
    expect(result.manifest.name).toBe("Test Widget");
    expect(result.entryFilename).toBe("widget.js");
    expect(result.entryBuffer.length).toBeGreaterThan(0);
  });

  it("throws 400 when manifest.json is missing", () => {
    const zip = makeZip({ "widget.js": VALID_BUNDLE });
    expect(() => extractWidgetZip(zip)).toThrow("manifest.json ausente");
  });

  it("throws 400 when entry file is missing", () => {
    const manifest = JSON.stringify({ name: "W", version: "1.0.0", author: "A", entry: "missing.js", permissions: [] });
    const zip = makeZip({ "manifest.json": manifest });
    expect(() => extractWidgetZip(zip)).toThrow('Arquivo de entrada "missing.js" não encontrado');
  });

  it("throws 400 when manifest.json is invalid JSON", () => {
    const zip = makeZip({ "manifest.json": "NOT JSON", "widget.js": VALID_BUNDLE });
    expect(() => extractWidgetZip(zip)).toThrow("não é um JSON válido");
  });

  it("normalises paths inside a top-level directory", () => {
    const zip = makeZip({
      "dist/manifest.json": VALID_MANIFEST,
      "dist/widget.js": VALID_BUNDLE,
    });
    const result = extractWidgetZip(zip);
    expect(result.manifest.name).toBe("Test Widget");
  });

  it("throws 400 when ZIP buffer is corrupted", () => {
    expect(() => extractWidgetZip(Buffer.from("not a zip"))).toThrow();
  });
});
