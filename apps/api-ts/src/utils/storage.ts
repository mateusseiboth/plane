// Asset storage abstraction. Files go to an S3-compatible bucket when one is
// configured (Instance.configurations.s3 — e.g. Magalu Cloud, AWS, MinIO),
// otherwise to local disk (the default). Bun's native S3 client speaks the
// S3 API, so any S3-compatible endpoint works with just endpoint+region+keys.

import prisma from "@db";
import {existsSync, mkdirSync} from "fs";
import {mkdir, readFile, writeFile} from "fs/promises";
import path from "path";

const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(process.cwd(), "media");
if (!existsSync(MEDIA_ROOT)) {
  try {
    mkdirSync(MEDIA_ROOT, {recursive: true});
  } catch {
    // best effort; saveAsset will surface a real error if the dir is unusable
  }
}

export type S3Config = {
  endpoint?: string;
  region?: string;
  bucket?: string;
  access_key?: string;
  secret_key?: string;
};

function isUsable(cfg: S3Config | null | undefined): cfg is Required<Pick<S3Config, "endpoint" | "bucket" | "access_key" | "secret_key">> & S3Config {
  return Boolean(cfg && cfg.endpoint && cfg.bucket && cfg.access_key && cfg.secret_key);
}

// Cache the resolved config/client for a short window so we don't read the
// Instance row on every upload/serve, but still pick up settings changes quickly.
const TTL_MS = 30_000;
let cache: {at: number; client: any | null} = {at: 0, client: null};

async function getClient(): Promise<any | null> {
  const now = Date.now();
  if (now - cache.at < TTL_MS) return cache.client;
  let client: any | null = null;
  try {
    const instance = await prisma.instance.findFirst({select: {configurations: true}});
    const cfg = (instance?.configurations as any)?.s3 as S3Config | undefined;
    if (isUsable(cfg)) {
      // Bun.S3Client is provided by the Bun runtime (untyped in plain tsc).
      client = new (Bun as any).S3Client({
        accessKeyId: cfg.access_key,
        secretAccessKey: cfg.secret_key,
        region: cfg.region || "auto",
        endpoint: cfg.endpoint,
        bucket: cfg.bucket,
      });
    }
  } catch (e) {
    console.error("[storage] failed to build S3 client, using local disk:", e);
    client = null;
  }
  cache = {at: now, client};
  return client;
}

/** Force the next operation to re-read the storage config (call after settings change). */
export function invalidateStorageCache() {
  cache = {at: 0, client: null};
}

function localPath(key: string) {
  return path.join(MEDIA_ROOT, key);
}

async function serveLocal(key: string, mimeType?: string | null): Promise<Response | null> {
  const fp = localPath(key);
  if (!existsSync(fp)) return null;
  const buf = await readFile(fp);
  return new Response(buf, {
    headers: {"Content-Type": mimeType ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000"},
  });
}

export async function saveAsset(key: string, file: Blob): Promise<void> {
  const client = await getClient();
  if (client) {
    await client.write(key, file);
    return;
  }
  const fp = localPath(key);
  await mkdir(path.dirname(fp), {recursive: true});
  await writeFile(fp, Buffer.from(await file.arrayBuffer()));
}

export async function serveAsset(key: string, mimeType?: string | null): Promise<Response | null> {
  const client = await getClient();
  if (client) {
    try {
      const f = client.file(key);
      if (await f.exists()) {
        const buf = await f.arrayBuffer();
        return new Response(buf, {
          headers: {
            "Content-Type": mimeType ?? f.type ?? "application/octet-stream",
            "Cache-Control": "public, max-age=31536000",
          },
        });
      }
    } catch (e) {
      console.error("[storage] S3 read failed, falling back to local:", e);
    }
    // Assets uploaded before S3 was enabled still live on disk.
    return serveLocal(key, mimeType);
  }
  return serveLocal(key, mimeType);
}

export async function copyAsset(srcKey: string, destKey: string): Promise<void> {
  const client = await getClient();
  if (client) {
    try {
      const src = client.file(srcKey);
      if (await src.exists()) {
        await client.write(destKey, await src.arrayBuffer());
        return;
      }
    } catch (e) {
      console.error("[storage] S3 copy failed, trying local:", e);
    }
  }
  // local copy (also the path when the source predates S3)
  const srcPath = localPath(srcKey);
  if (existsSync(srcPath)) {
    const buf = await readFile(srcPath);
    if (client) {
      await client.write(destKey, buf);
    } else {
      const dp = localPath(destKey);
      await mkdir(path.dirname(dp), {recursive: true});
      await writeFile(dp, buf);
    }
  }
}
