import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __chatPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
  // The chat backend may point at its own database (CHAT_DATABASE_URL); by
  // default it shares the Plane Postgres (DATABASE_URL). Tables are prefixed
  // chat_* so they never collide with the Plane schema.
  // Use CHAT_DATABASE_URL only when set to a non-empty value; otherwise share the
  // Plane DATABASE_URL. `||` (not `??`) so an empty env var falls back too.
  const connectionString = process.env.CHAT_DATABASE_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter, log: ["error"] });
}

const prisma: PrismaClient = globalThis.__chatPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__chatPrisma = prisma;
}

export default prisma;
