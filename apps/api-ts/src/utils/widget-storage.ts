import { writeFile, readFile, mkdir, unlink } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import path from "path";

export interface WidgetStorageDriver {
  put(key: string, buffer: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}

// ── Local disk driver ─────────────────────────────────────────────────────────

const WIDGET_STORAGE_ROOT =
  process.env.WIDGET_STORAGE_ROOT ||
  path.join(process.env.MEDIA_ROOT || path.join(process.cwd(), "media"), "widgets");

if (!existsSync(WIDGET_STORAGE_ROOT)) {
  try { mkdirSync(WIDGET_STORAGE_ROOT, { recursive: true }); } catch {}
}

const localDriver: WidgetStorageDriver = {
  async put(key, buffer) {
    const fullPath = path.join(WIDGET_STORAGE_ROOT, key);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
  },
  async get(key) {
    return readFile(path.join(WIDGET_STORAGE_ROOT, key));
  },
  async delete(key) {
    const fullPath = path.join(WIDGET_STORAGE_ROOT, key);
    if (existsSync(fullPath)) await unlink(fullPath);
  },
  getUrl(key) {
    return `/api/v1/widgets/assets/${key}`;
  },
};

// ── Driver selection ──────────────────────────────────────────────────────────

function buildDriver(): WidgetStorageDriver {
  const driver = (process.env.WIDGET_STORAGE_DRIVER ?? "local").toLowerCase();
  if (driver === "local") return localDriver;
  // Future: "s3" | "minio" drivers can be plugged in here
  console.warn(`[widget-storage] Unknown driver "${driver}", falling back to local.`);
  return localDriver;
}

export const widgetStorage: WidgetStorageDriver = buildDriver();
