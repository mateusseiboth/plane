// Normalização dos caminhos de um ZIP de extensão (plugin ou widget).
//
// Um pacote pode vir de duas formas: com os arquivos na raiz do ZIP, ou
// embrulhado num diretório (dist/manifest.json, meu-plugin/plugin.js…).
// Remover cegamente o primeiro segmento de todo caminho resolve o segundo caso
// e ESTRAGA o primeiro: "assets/logo.svg" virava "logo.svg", quebrando qualquer
// referência do bundle a subpastas — e um `entry` aninhado deixava de ser
// encontrado, devolvendo 400 num ZIP válido.
//
// Só removemos o diretório raiz quando o ZIP inteiro está dentro dele.

export function normalizeZipEntries(files: Record<string, Uint8Array>): Record<string, Uint8Array> {
  const isDirEntry = (p: string) => p.endsWith("/");
  const paths = Object.keys(files).filter((p) => !isDirEntry(p) && p.split("/").filter(Boolean).length > 0);
  const isWrapped =
    paths.length > 0 &&
    paths.every((p) => p.split("/").filter(Boolean).length > 1) &&
    new Set(paths.map((p) => p.split("/").filter(Boolean)[0])).size === 1;

  const out: Record<string, Uint8Array> = {};
  for (const [filePath, data] of Object.entries(files)) {
    if (isDirEntry(filePath)) continue; // entrada de diretório, não é arquivo
    const parts = filePath.split("/").filter(Boolean);
    if (!parts.length) continue;
    const key = isWrapped ? parts.slice(1).join("/") : parts.join("/");
    if (key) out[key] = data;
  }
  return out;
}
