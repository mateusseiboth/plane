// Media storage for chat attachments. Uses an S3-compatible bucket when
// configured (env CHAT_S3_*), otherwise local disk. Mirrors the approach in the
// Plane api-ts utils/storage.ts but configured via env (this service is infra).

import { existsSync, mkdirSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const MEDIA_ROOT = process.env.CHAT_MEDIA_ROOT || path.join(process.cwd(), "media");
if (!existsSync(MEDIA_ROOT)) {
  try {
    mkdirSync(MEDIA_ROOT, { recursive: true });
  } catch {
    /* best effort */
  }
}

function s3Client(): any | null {
  const endpoint = process.env.CHAT_S3_ENDPOINT;
  const bucket = process.env.CHAT_S3_BUCKET;
  const accessKeyId = process.env.CHAT_S3_ACCESS_KEY;
  const secretAccessKey = process.env.CHAT_S3_SECRET_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  try {
    return new (Bun as any).S3Client({
      accessKeyId,
      secretAccessKey,
      region: process.env.CHAT_S3_REGION || "auto",
      endpoint,
      bucket,
    });
  } catch {
    return null;
  }
}

const client = s3Client();

export async function saveMedia(key: string, data: Blob | Buffer): Promise<void> {
  if (client) {
    await client.write(key, data);
    return;
  }
  const fp = path.join(MEDIA_ROOT, key);
  await mkdir(path.dirname(fp), { recursive: true });
  const buf = data instanceof Buffer ? data : Buffer.from(await (data as Blob).arrayBuffer());
  await writeFile(fp, buf);
}

/** O arquivo já está no storage? Usado para tornar a reimportação idempotente. */
export async function mediaExists(key: string): Promise<boolean> {
  if (client) {
    try {
      return await client.file(key).exists();
    } catch {
      return false;
    }
  }
  return existsSync(path.join(MEDIA_ROOT, key));
}

export async function serveMedia(key: string, mime?: string | null): Promise<Response | null> {
  if (client) {
    try {
      const f = client.file(key);
      if (await f.exists()) {
        const buf = await f.arrayBuffer();
        return new Response(buf, {
          headers: { "Content-Type": mime ?? f.type ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000" },
        });
      }
    } catch {
      /* fall through to local */
    }
  }
  const fp = path.join(MEDIA_ROOT, key);
  if (!existsSync(fp)) return null;
  const buf = await readFile(fp);
  return new Response(buf, {
    headers: { "Content-Type": mime ?? "application/octet-stream", "Cache-Control": "public, max-age=31536000" },
  });
}
