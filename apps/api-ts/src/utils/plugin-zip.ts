import { unzipSync, strFromU8 } from "fflate";

const MAX_ZIP_BYTES = Number(process.env.PLUGIN_MAX_ZIP_SIZE ?? 20 * 1024 * 1024);   // 20 MB
const MAX_BUNDLE_BYTES = Number(process.env.PLUGIN_MAX_BUNDLE_SIZE ?? 10 * 1024 * 1024); // 10 MB

export interface ExtractedPlugin {
  manifest: Record<string, unknown>;
  entryBuffer: Buffer;
  entryFilename: string;
  /** Every file in the archive (normalized paths) so we can persist extra assets. */
  files: Record<string, Buffer>;
}

export function extractPluginZip(zipBuffer: Buffer): ExtractedPlugin {
  if (zipBuffer.byteLength > MAX_ZIP_BYTES) {
    throw Object.assign(new Error(`ZIP exceeds maximum size of ${MAX_ZIP_BYTES / 1024 / 1024} MB.`), { status: 400 });
  }

  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(new Uint8Array(zipBuffer));
  } catch {
    throw Object.assign(new Error("Invalid or corrupted ZIP file."), { status: 400 });
  }

  // Normalize paths: strip a single leading directory prefix if present
  // (e.g. my-plugin/manifest.json → manifest.json)
  const normalized: Record<string, Uint8Array> = {};
  for (const [filePath, data] of Object.entries(files)) {
    const parts = filePath.split("/").filter(Boolean);
    const key = parts.length > 1 ? parts.slice(1).join("/") : parts[0];
    if (key) normalized[key] = data;
  }

  if (!normalized["manifest.json"]) {
    throw Object.assign(new Error("Missing manifest.json in ZIP."), { status: 400 });
  }

  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(strFromU8(normalized["manifest.json"]));
  } catch {
    throw Object.assign(new Error("manifest.json is not valid JSON."), { status: 400 });
  }

  const entryFilename = String(manifest.entry ?? "plugin.js");
  if (!normalized[entryFilename]) {
    throw Object.assign(new Error(`Entry file "${entryFilename}" not found in ZIP.`), { status: 400 });
  }

  const entryBuffer = Buffer.from(normalized[entryFilename]);
  if (entryBuffer.byteLength > MAX_BUNDLE_BYTES) {
    throw Object.assign(
      new Error(`Bundle exceeds maximum size of ${MAX_BUNDLE_BYTES / 1024 / 1024} MB.`),
      { status: 400 }
    );
  }

  const allFiles: Record<string, Buffer> = {};
  for (const [k, v] of Object.entries(normalized)) {
    if (k === "manifest.json") continue;
    allFiles[k] = Buffer.from(v);
  }

  return { manifest, entryBuffer, entryFilename, files: allFiles };
}
