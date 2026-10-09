/**
 * Empacota o SDK e o projeto de exemplo para a própria instância servir: o
 * pacote não está no npm. Gera em `dist/publico/`:
 *
 * - `widgets-aviao-<versão>.tgz` e `widgets-aviao.tgz` (a última): o tarball no
 *   formato do `npm pack`, que `npm install https://<host>/sdk/widgets-aviao.tgz` entende;
 * - `widget-exemplo.zip`: o projeto Vite de `exemplo/`, com o tarball em `vendor/`.
 *
 * O build do web copia essa pasta para `/sdk/`. Sem dependência: tar, gzip e zip
 * saem do `node:zlib`. Roda no build do pacote (`node scripts/empacotar.ts`).
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, gzipSync } from "node:zlib";

export type TArquivo = { caminho: string; conteudo: Uint8Array };

const encoder = new TextEncoder();

/** Mesma data fixa do `npm pack`: o tarball só muda quando o conteúdo muda. */
const MTIME_DO_NPM = 499162500;
const PASTA_PUBLICA = "dist/publico";
const PASTA_DO_EXEMPLO = "widget-exemplo";
const FORA_DO_EXEMPLO = new Set(["node_modules", "dist", "vendor"]);

// ── tar (ustar) ───────────────────────────────────────────────────────────────

const writeCampo = (cabecalho: Uint8Array, offset: number, valor: string) =>
  cabecalho.set(encoder.encode(valor), offset);

const toOctal = (valor: number, digitos: number) => `${valor.toString(8).padStart(digitos, "0")}\0`;

function buildCabecalhoTar(caminho: string, tamanho: number): Uint8Array {
  if (encoder.encode(caminho).length > 100) throw new Error(`Caminho longo demais para o tar: ${caminho}`);
  const cabecalho = new Uint8Array(512);
  writeCampo(cabecalho, 0, caminho);
  writeCampo(cabecalho, 100, "0000644\0");
  writeCampo(cabecalho, 108, "0000000\0");
  writeCampo(cabecalho, 116, "0000000\0");
  writeCampo(cabecalho, 124, toOctal(tamanho, 11));
  writeCampo(cabecalho, 136, toOctal(MTIME_DO_NPM, 11));
  writeCampo(cabecalho, 148, "        ");
  writeCampo(cabecalho, 156, "0");
  writeCampo(cabecalho, 257, "ustar\0");
  writeCampo(cabecalho, 263, "00");
  const soma = cabecalho.reduce((total, byte) => total + byte, 0);
  writeCampo(cabecalho, 148, `${soma.toString(8).padStart(6, "0")}\0 `);
  return cabecalho;
}

const concat = (partes: Uint8Array[]) => {
  const total = new Uint8Array(partes.reduce((soma, p) => soma + p.length, 0));
  partes.reduce((offset, parte) => {
    total.set(parte, offset);
    return offset + parte.length;
  }, 0);
  return total;
};

/** Tar ustar dos arquivos, terminado pelos dois blocos vazios. */
export function buildTar(arquivos: TArquivo[]): Uint8Array {
  const blocos = arquivos.flatMap(({ caminho, conteudo }) => [
    buildCabecalhoTar(caminho, conteudo.length),
    conteudo,
    new Uint8Array((512 - (conteudo.length % 512)) % 512),
  ]);
  return concat([...blocos, new Uint8Array(1024)]);
}

// ── zip ───────────────────────────────────────────────────────────────────────

const TABELA_CRC = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>((c) => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1), n)
);

const buildCrc32 = (dados: Uint8Array) =>
  (dados.reduce((crc, byte) => TABELA_CRC[(crc ^ byte) & 0xff] ^ (crc >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;

/** 01/01/1980, a menor data do formato: o zip só muda quando o conteúdo muda. */
const DATA_DO_ZIP = (0 << 9) | (1 << 5) | 1;
const UTF8 = 0x0800;

function buildRegistroZip(arquivo: TArquivo, offsetLocal: number) {
  const nome = encoder.encode(arquivo.caminho);
  const comprimido = new Uint8Array(deflateRawSync(arquivo.conteudo));
  const crc = buildCrc32(arquivo.conteudo);

  const local = new DataView(new ArrayBuffer(30));
  [
    [0, 0x04034b50, 4],
    [4, 20, 2],
    [6, UTF8, 2],
    [8, 8, 2],
    [10, 0, 2],
    [12, DATA_DO_ZIP, 2],
    [14, crc, 4],
    [18, comprimido.length, 4],
    [22, arquivo.conteudo.length, 4],
    [26, nome.length, 2],
    [28, 0, 2],
  ].forEach(([offset, valor, bytes]) => writeNumero(local, offset, valor, bytes));

  const central = new DataView(new ArrayBuffer(46));
  [
    [0, 0x02014b50, 4],
    [4, 20, 2],
    [6, 20, 2],
    [8, UTF8, 2],
    [10, 8, 2],
    [12, 0, 2],
    [14, DATA_DO_ZIP, 2],
    [16, crc, 4],
    [20, comprimido.length, 4],
    [24, arquivo.conteudo.length, 4],
    [28, nome.length, 2],
    [42, offsetLocal, 4],
  ].forEach(([offset, valor, bytes]) => writeNumero(central, offset, valor, bytes));

  return {
    local: concat([new Uint8Array(local.buffer), nome, comprimido]),
    central: concat([new Uint8Array(central.buffer), nome]),
  };
}

function writeNumero(view: DataView, offset: number, valor: number, bytes: number) {
  if (bytes === 4) return view.setUint32(offset, valor, true);
  view.setUint16(offset, valor, true);
}

/** Zip com deflate, nomes em UTF-8. */
export function buildZip(arquivos: TArquivo[]): Uint8Array {
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let offset = 0;
  for (const arquivo of arquivos) {
    const registro = buildRegistroZip(arquivo, offset);
    locais.push(registro.local);
    centrais.push(registro.central);
    offset += registro.local.length;
  }
  const diretorio = concat(centrais);
  const fim = new DataView(new ArrayBuffer(22));
  [
    [0, 0x06054b50, 4],
    [8, arquivos.length, 2],
    [10, arquivos.length, 2],
    [12, diretorio.length, 4],
    [16, offset, 4],
  ].forEach(([pos, valor, bytes]) => writeNumero(fim, pos, valor, bytes));
  return concat([...locais, diretorio, new Uint8Array(fim.buffer)]);
}

// ── pacote do SDK e exemplo ───────────────────────────────────────────────────

/** O package.json como o npm publicaria: `publishConfig` aplicado, sem scripts nem devDependencies. */
export function buildPackageJsonPublicado(pacote: Record<string, unknown>): Record<string, unknown> {
  const { publishConfig, scripts, devDependencies, ...publicado } = pacote;
  return { ...publicado, ...(publishConfig as Record<string, unknown> | undefined) };
}

/** Arquivos de uma pasta, com caminho relativo, em ordem estável; `fora` corta pastas de primeiro nível. */
function findArquivos(raiz: string, pasta: string, fora: Set<string> = new Set()): string[] {
  const base = path.join(raiz, pasta);
  return readdirSync(base)
    .toSorted()
    .filter((nome) => !fora.has(nome))
    .flatMap((nome) => {
      const relativo = path.posix.join(pasta, nome);
      if (statSync(path.join(raiz, relativo)).isDirectory()) return findArquivos(raiz, relativo);
      return [relativo];
    });
}

const readArquivo = (raiz: string, relativo: string) => new Uint8Array(readFileSync(path.join(raiz, relativo)));

/** O tarball do SDK no formato do `npm pack`: tudo dentro de `package/`. */
export function buildPacoteDoSdk(raiz: string) {
  const pacote = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
  const publicado = buildPackageJsonPublicado(pacote);
  const dist = findArquivos(raiz, "dist").filter((arquivo) => !arquivo.startsWith(`${PASTA_PUBLICA}/`));
  const arquivos: TArquivo[] = [
    { caminho: "package/package.json", conteudo: encoder.encode(`${JSON.stringify(publicado, null, 2)}\n`) },
    ...["README.md", "referencia.json", ...dist].map((relativo) => ({
      caminho: `package/${relativo}`,
      conteudo: readArquivo(raiz, relativo),
    })),
  ];
  return { versao: pacote.version as string, tarball: new Uint8Array(gzipSync(buildTar(arquivos))) };
}

/** O projeto de `exemplo/` dentro de `widget-exemplo/`, com o SDK em `vendor/widgets-aviao.tgz`. */
export function buildZipDoExemplo(raiz: string, tarball: Uint8Array): Uint8Array {
  const arquivos = findArquivos(raiz, "exemplo", FORA_DO_EXEMPLO)
    .filter((relativo) => !relativo.endsWith(".zip"))
    .map((relativo) => ({
      caminho: relativo.replace(/^exemplo\//, `${PASTA_DO_EXEMPLO}/`),
      conteudo: readArquivo(raiz, relativo),
    }));
  return buildZip([...arquivos, { caminho: `${PASTA_DO_EXEMPLO}/vendor/widgets-aviao.tgz`, conteudo: tarball }]);
}

/** Grava os três arquivos em `dist/publico/`, de onde o build do web os copia para `/sdk/`. */
export function saveArquivosPublicos(raiz: string) {
  const destino = path.join(raiz, PASTA_PUBLICA);
  mkdirSync(destino, { recursive: true });
  const { versao, tarball } = buildPacoteDoSdk(raiz);
  writeFileSync(path.join(destino, `widgets-aviao-${versao}.tgz`), tarball);
  writeFileSync(path.join(destino, "widgets-aviao.tgz"), tarball);
  writeFileSync(path.join(destino, "widget-exemplo.zip"), buildZipDoExemplo(raiz, tarball));
  return destino;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  console.log(`SDK e exemplo empacotados em ${saveArquivosPublicos(raiz)}`);
}
