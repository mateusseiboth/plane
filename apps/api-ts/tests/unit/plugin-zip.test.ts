/**
 * Extração do ZIP de plugin. Além do manifest e do bundle de entrada, o plugin
 * pode trazer assets extras — que precisam ser preservados com o caminho
 * normalizado (sem o diretório raiz do ZIP).
 */
import {describe, expect, it} from "bun:test";
import {strToU8, zipSync} from "fflate";
import {extractPluginZip} from "@utils/plugin-zip";

function makeZip(files: Record<string, string>): Buffer {
  const input: Record<string, Uint8Array> = {};
  for (const [p, content] of Object.entries(files)) input[p] = strToU8(content);
  return Buffer.from(zipSync(input));
}

const MANIFEST = JSON.stringify({
  name: "Backup Manager",
  slug: "backup-manager",
  version: "1.2.0",
  author: "Quality",
  entry: "plugin.js",
});

const BUNDLE = "export default function Plugin() { return null; }";

describe("extractPluginZip", () => {
  it("extrai manifest, bundle e assets extras", () => {
    const result = extractPluginZip(
      makeZip({"manifest.json": MANIFEST, "plugin.js": BUNDLE, "assets/logo.svg": "<svg/>", "README.md": "doc"}),
    );
    expect(result.manifest.slug).toBe("backup-manager");
    expect(result.entryFilename).toBe("plugin.js");
    expect(result.entryBuffer.toString()).toBe(BUNDLE);
    // A subpasta `assets/` precisa sobreviver: achatá-la quebra as referências
    // do bundle aos próprios arquivos.
    expect(Object.keys(result.files).sort()).toEqual(["README.md", "assets/logo.svg", "plugin.js"]);
    expect(result.files["assets/logo.svg"].toString()).toBe("<svg/>");
  });

  it("não devolve o manifest entre os arquivos extras", () => {
    const result = extractPluginZip(makeZip({"manifest.json": MANIFEST, "plugin.js": BUNDLE}));
    expect(result.files["manifest.json"]).toBeUndefined();
  });

  it("remove o diretório raiz do ZIP", () => {
    const result = extractPluginZip(
      makeZip({"backup-manager/manifest.json": MANIFEST, "backup-manager/plugin.js": BUNDLE, "backup-manager/a/b.txt": "x"}),
    );
    expect(result.manifest.name).toBe("Backup Manager");
    expect(result.files["a/b.txt"].toString()).toBe("x");
  });

  it("usa plugin.js como entrada padrão quando o manifest omite `entry`", () => {
    const manifest = JSON.stringify({name: "X", version: "1.0.0", author: "A"});
    const result = extractPluginZip(makeZip({"manifest.json": manifest, "plugin.js": BUNDLE}));
    expect(result.entryFilename).toBe("plugin.js");
  });

  it("400 quando o manifest.json não está no ZIP", () => {
    expect(() => extractPluginZip(makeZip({"plugin.js": BUNDLE}))).toThrow("manifest.json ausente");
  });

  it("400 quando o manifest.json não é JSON válido", () => {
    expect(() => extractPluginZip(makeZip({"manifest.json": "{{{", "plugin.js": BUNDLE}))).toThrow(
      "não é um JSON válido",
    );
  });

  it("400 quando o arquivo de entrada declarado não existe", () => {
    const manifest = JSON.stringify({name: "X", version: "1.0.0", author: "A", entry: "faltando.js"});
    expect(() => extractPluginZip(makeZip({"manifest.json": manifest}))).toThrow('"faltando.js" não encontrado');
  });

  it("encontra um `entry` dentro de subpasta quando o manifest está na raiz", () => {
    const manifest = JSON.stringify({name: "X", version: "1.0.0", author: "A", entry: "dist/plugin.js"});
    const result = extractPluginZip(makeZip({"manifest.json": manifest, "dist/plugin.js": BUNDLE}));
    expect(result.entryFilename).toBe("dist/plugin.js");
    expect(result.entryBuffer.toString()).toBe(BUNDLE);
  });

  it("400 para arquivo corrompido", () => {
    expect(() => extractPluginZip(Buffer.from("isto não é um zip"))).toThrow("inválido ou corrompido");
  });

  it("400 quando o ZIP excede o tamanho máximo", () => {
    const limit = Number(process.env.PLUGIN_MAX_ZIP_SIZE ?? 20 * 1024 * 1024);
    const big = Buffer.alloc(limit + 1);
    expect(() => extractPluginZip(big)).toThrow("excede o tamanho máximo");
  });

  it("propaga status 400 nos erros para o handler HTTP", () => {
    try {
      extractPluginZip(makeZip({"plugin.js": BUNDLE}));
      throw new Error("deveria ter lançado");
    } catch (e: any) {
      expect(e.status).toBe(400);
    }
  });
});
