/**
 * Normalização dos caminhos de um ZIP de extensão. Remover o primeiro segmento
 * de todo caminho achatava subpastas legítimas ("assets/logo.svg" → "logo.svg")
 * e fazia um `entry` aninhado sumir; o desembrulho só é válido quando o ZIP
 * inteiro está dentro de um único diretório raiz.
 */
import {describe, expect, it} from "bun:test";
import {normalizeZipEntries} from "@utils/zip-entries";

const u8 = (s: string) => new TextEncoder().encode(s);
const entries = (paths: string[]) => Object.fromEntries(paths.map((p) => [p, u8(p)]));

describe("normalizeZipEntries", () => {
  it("preserva subpastas quando os arquivos estão na raiz", () => {
    const out = normalizeZipEntries(entries(["manifest.json", "plugin.js", "assets/logo.svg"]));
    expect(Object.keys(out).sort()).toEqual(["assets/logo.svg", "manifest.json", "plugin.js"]);
  });

  it("desembrulha quando todo o ZIP está num único diretório", () => {
    const out = normalizeZipEntries(entries(["dist/manifest.json", "dist/plugin.js", "dist/assets/logo.svg"]));
    expect(Object.keys(out).sort()).toEqual(["assets/logo.svg", "manifest.json", "plugin.js"]);
  });

  it("não desembrulha quando há mais de um diretório raiz", () => {
    const out = normalizeZipEntries(entries(["a/x.js", "b/y.js"]));
    expect(Object.keys(out).sort()).toEqual(["a/x.js", "b/y.js"]);
  });

  it("não desembrulha quando algum arquivo já está na raiz", () => {
    const out = normalizeZipEntries(entries(["manifest.json", "dist/plugin.js"]));
    expect(Object.keys(out).sort()).toEqual(["dist/plugin.js", "manifest.json"]);
  });

  it("descarta entradas de diretório e barras redundantes", () => {
    const out = normalizeZipEntries({
      "pasta/": u8(""),
      "/manifest.json": u8("m"),
      "assets//logo.svg": u8("l"),
    });
    expect(Object.keys(out).sort()).toEqual(["assets/logo.svg", "manifest.json"]);
  });

  it("ZIP vazio devolve objeto vazio", () => {
    expect(normalizeZipEntries({})).toEqual({});
  });
});
