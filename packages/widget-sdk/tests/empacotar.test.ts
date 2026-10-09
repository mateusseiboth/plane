/**
 * A instância serve o SDK e o projeto de exemplo (não existe pacote no npm).
 * O empacotador monta o tarball que o `npm install <url>` entende e o zip do
 * exemplo, já com o tarball dentro.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import {
  buildPackageJsonPublicado,
  buildPacoteDoSdk,
  buildTar,
  buildZip,
  buildZipDoExemplo,
} from "../scripts/empacotar";

const decoder = new TextDecoder();

/** Lê nomes e conteúdos de um tar (ustar), independente do empacotador. */
function readTar(tar: Uint8Array) {
  const arquivos = new Map<string, Uint8Array>();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const cabecalho = tar.subarray(offset, offset + 512);
    const nome = decoder.decode(cabecalho.subarray(0, 100)).split("\0")[0];
    if (!nome) break;
    const tamanho = parseInt(decoder.decode(cabecalho.subarray(124, 136)).split("\0")[0].trim(), 8);
    const soma = cabecalho.reduce((total, byte, i) => total + (i >= 148 && i < 156 ? 32 : byte), 0);
    expect(parseInt(decoder.decode(cabecalho.subarray(148, 156)), 8)).toBe(soma);
    arquivos.set(nome, tar.subarray(offset + 512, offset + 512 + tamanho));
    offset += 512 + Math.ceil(tamanho / 512) * 512;
  }
  return arquivos;
}

/** Lê o diretório central de um zip e descompacta cada entrada. */
function readZip(zip: Uint8Array) {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fim = zip.length - 22;
  expect(view.getUint32(fim, true)).toBe(0x06054b50);
  const total = view.getUint16(fim + 10, true);
  const arquivos = new Map<string, Uint8Array>();
  let offset = view.getUint32(fim + 16, true);
  for (let i = 0; i < total; i++) {
    const metodo = view.getUint16(offset + 10, true);
    const tamanho = view.getUint32(offset + 20, true);
    const tamanhoDoNome = view.getUint16(offset + 28, true);
    const extra = view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const nome = decoder.decode(zip.subarray(offset + 46, offset + 46 + tamanhoDoNome));
    const inicio = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const dados = zip.subarray(inicio, inicio + tamanho);
    arquivos.set(nome, metodo === 8 ? new Uint8Array(inflateRawSync(dados)) : dados);
    offset += 46 + tamanhoDoNome + extra;
  }
  return arquivos;
}

let raiz: string;

const write = (relativo: string, conteudo: string) => {
  const destino = path.join(raiz, relativo);
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(destino, conteudo);
};

beforeAll(() => {
  raiz = mkdtempSync(path.join(tmpdir(), "widget-sdk-pacote-"));
  write(
    "package.json",
    JSON.stringify({
      name: "@mateusseiboth/widgets-aviao",
      version: "2.3.4",
      type: "module",
      types: "src/index.ts",
      exports: { ".": { types: "./src/index.ts", import: "./dist/index.mjs" } },
      publishConfig: { types: "dist/index.d.ts", exports: { ".": { types: "./dist/index.d.ts" } } },
      scripts: { build: "vite build" },
      devDependencies: { vite: "^5" },
      peerDependencies: { react: ">=18" },
    })
  );
  write("README.md", "# SDK");
  write("referencia.json", "{}");
  write("dist/index.mjs", "export const x = 1;");
  write("dist/index.d.ts", "export declare const x: number;");
  write("dist/publico/widgets-aviao.tgz", "velho");
  write("src/index.ts", "export const x = 1;");
  write("exemplo/package.json", '{ "name": "meu-widget" }');
  write("exemplo/manifest.json", '{ "name": "Meu widget" }');
  write("exemplo/src/index.tsx", "export default function Widget() { return null; }");
  write("exemplo/node_modules/react/index.js", "lixo");
  write("exemplo/dist/widget.js", "lixo");
  write("exemplo/widget.zip", "lixo");
});

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe("buildTar e buildZip", () => {
  it("o tar guarda nome e conteúdo de cada arquivo", () => {
    const arquivos = readTar(buildTar([{ caminho: "package/a.txt", conteudo: new TextEncoder().encode("olá") }]));
    expect(decoder.decode(arquivos.get("package/a.txt"))).toBe("olá");
  });

  it("o zip guarda nome e conteúdo de cada arquivo", () => {
    const arquivos = readZip(
      buildZip([{ caminho: "pasta/b.txt", conteudo: new TextEncoder().encode("conteúdo ".repeat(50)) }])
    );
    expect(decoder.decode(arquivos.get("pasta/b.txt"))).toBe("conteúdo ".repeat(50));
  });
});

describe("buildPackageJsonPublicado", () => {
  it("aplica o publishConfig e tira scripts e dependências de desenvolvimento", () => {
    const publicado = buildPackageJsonPublicado({
      name: "x",
      types: "src/index.ts",
      exports: { ".": { types: "./src/index.ts" } },
      publishConfig: { types: "dist/index.d.ts", exports: { ".": { types: "./dist/index.d.ts" } } },
      scripts: { build: "vite build" },
      devDependencies: { vite: "^5" },
    });
    expect(publicado).toEqual({
      name: "x",
      types: "dist/index.d.ts",
      exports: { ".": { types: "./dist/index.d.ts" } },
    });
  });
});

describe("buildPacoteDoSdk", () => {
  it("monta o tarball no formato do npm (pasta package/), com dist, tipos e referência", () => {
    const { versao, tarball } = buildPacoteDoSdk(raiz);
    expect(versao).toBe("2.3.4");
    const arquivos = readTar(gunzipSync(tarball));
    expect([...arquivos.keys()].toSorted()).toEqual([
      "package/README.md",
      "package/dist/index.d.ts",
      "package/dist/index.mjs",
      "package/package.json",
      "package/referencia.json",
    ]);
    const pacote = JSON.parse(decoder.decode(arquivos.get("package/package.json")));
    expect(pacote.types).toBe("dist/index.d.ts");
    expect(pacote.scripts).toBeUndefined();
  });
});

describe("buildZipDoExemplo", () => {
  it("leva o projeto de exemplo com o SDK dentro, sem node_modules nem build", () => {
    const { tarball } = buildPacoteDoSdk(raiz);
    const arquivos = readZip(buildZipDoExemplo(raiz, tarball));
    expect([...arquivos.keys()].toSorted()).toEqual([
      "widget-exemplo/manifest.json",
      "widget-exemplo/package.json",
      "widget-exemplo/src/index.tsx",
      "widget-exemplo/vendor/widgets-aviao.tgz",
    ]);
    expect(arquivos.get("widget-exemplo/vendor/widgets-aviao.tgz")).toEqual(new Uint8Array(tarball));
  });
});
