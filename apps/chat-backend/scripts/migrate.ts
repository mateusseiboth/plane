/**
 * Lightweight, idempotent SQL migrator for the chat backend.
 *
 * The chat backend SHARES the Plane Postgres, so `prisma db push` / `migrate
 * deploy` are unsafe (they treat the chat schema as the whole DB and would drop
 * Plane tables, or clash on Plane's _prisma_migrations). Instead we apply
 * ordered .sql files from prisma/sql/ once each, tracked in chat_migrations.
 *
 * To add a schema change: generate the delta and drop it in prisma/sql:
 *   bunx prisma migrate diff --from-url $DATABASE_URL --to-schema prisma/schema.prisma --script
 *   # (then hand-trim to only the chat_* changes) → prisma/sql/000N_xxx.sql
 *
 * Usage: DATABASE_URL=... bun run scripts/migrate.ts
 */

import { readdir, readFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";

const SQL_DIR = path.join(import.meta.dir, "..", "prisma", "sql");

async function main() {
  const pool = new Pool({ connectionString: process.env.CHAT_DATABASE_URL || process.env.DATABASE_URL });

  await pool.query(`CREATE TABLE IF NOT EXISTS chat_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(SQL_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM chat_migrations WHERE name = $1", [file]);
    if (rows.length) {
      console.log(`[chat-migrate] skip ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(SQL_DIR, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO chat_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[chat-migrate] applied ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`[chat-migrate] FAILED ${file}:`, e);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("[chat-migrate] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
