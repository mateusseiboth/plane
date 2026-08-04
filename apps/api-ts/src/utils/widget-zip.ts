import { unzipSync, strFromU8 } from "fflate";
import { normalizeZipEntries } from "@utils/zip-entries";

const MAX_ZIP_BYTES = Number(process.env.WIDGET_MAX_ZIP_SIZE ?? 10 * 1024 * 1024);   // 10 MB
const MAX_BUNDLE_BYTES = Number(process.env.WIDGET_MAX_BUNDLE_SIZE ?? 5 * 1024 * 1024); // 5 MB

export interface ExtractedWidget {
  manifest: Record<string, unknown>;
  entryBuffer: Buffer;
  entryFilename: string;
}

export function extractWidgetZip(zipBuffer: Buffer): ExtractedWidget {
  if (zipBuffer.byteLength > MAX_ZIP_BYTES) {
    throw Object.assign(new Error(`O ZIP excede o tamanho máximo de ${MAX_ZIP_BYTES / 1024 / 1024} MB.`), { status: 400 });
  }

  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(new Uint8Array(zipBuffer));
  } catch {
    throw Object.assign(new Error("Arquivo ZIP inválido ou corrompido."), { status: 400 });
  }

  // Normalize paths: strip the wrapping directory only when the whole archive
  // lives inside it (e.g. widget/manifest.json → manifest.json).
  const normalized = normalizeZipEntries(files);

  if (!normalized["manifest.json"]) {
    throw Object.assign(new Error("manifest.json ausente no ZIP."), { status: 400 });
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(strFromU8(normalized["manifest.json"]));
  } catch {
    throw Object.assign(new Error("manifest.json não é um JSON válido."), { status: 400 });
  }

  const entryFilename = String(manifest.entry ?? "widget.js");
  if (!normalized[entryFilename]) {
    throw Object.assign(new Error(`Arquivo de entrada "${entryFilename}" não encontrado no ZIP.`), { status: 400 });
  }

  const entryBuffer = Buffer.from(normalized[entryFilename]);
  if (entryBuffer.byteLength > MAX_BUNDLE_BYTES) {
    throw Object.assign(
      new Error(`O bundle excede o tamanho máximo de ${MAX_BUNDLE_BYTES / 1024 / 1024} MB.`),
      { status: 400 }
    );
  }

  return { manifest, entryBuffer, entryFilename };
}
