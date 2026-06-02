/**
 * Password reset utility.
 *
 * Resets a user's password to a known value and clears `isPasswordAutoset`, so
 * the seeder (which only primes never-changed accounts) will NOT overwrite it on
 * the next `docker compose up` — the new password sticks.
 *
 * Usage:
 *   # one user
 *   RESET_EMAIL=fulano@empresa.com RESET_PASSWORD=novaSenha \
 *     DATABASE_URL=postgresql://... bun run scripts/reset-password.ts
 *
 *   # every non-admin user back to the default (e.g. after a messy import)
 *   RESET_ALL=true RESET_PASSWORD=teste \
 *     DATABASE_URL=postgresql://... bun run scripts/reset-password.ts
 *
 * Options (env vars):
 *   RESET_EMAIL=...        - Target a single user by email (case-insensitive)
 *   RESET_ALL=true          - Reset every active non-admin user (ignored if RESET_EMAIL is set)
 *   RESET_PASSWORD=teste    - Password to set (default "teste")
 *   INCLUDE_ADMINS=true     - With RESET_ALL, also reset instance admins (default false)
 *   KEEP_AUTOSET=true       - Leave isPasswordAutoset=true (forces a change on first login)
 *   DRY_RUN=true            - Report what would change, write nothing
 */

import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {Pool} from "pg";

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pool)});

const RESET_EMAIL = process.env.RESET_EMAIL?.toLowerCase().trim();
const RESET_ALL = process.env.RESET_ALL === "true";
const RESET_PASSWORD = process.env.RESET_PASSWORD ?? "teste";
const INCLUDE_ADMINS = process.env.INCLUDE_ADMINS === "true";
const KEEP_AUTOSET = process.env.KEEP_AUTOSET === "true";
const DRY_RUN = process.env.DRY_RUN === "true";

function log(msg: string) {
  console.log(`[reset-password] ${msg}`);
}

async function main() {
  if (!RESET_EMAIL && !RESET_ALL) {
    log("Nothing to do: set RESET_EMAIL=<email> or RESET_ALL=true.");
    process.exit(1);
  }

  const hash = await Bun.password.hash(RESET_PASSWORD, {algorithm: "bcrypt", cost: 12});

  const where: any = {deletedAt: null};
  if (RESET_EMAIL) {
    where.email = RESET_EMAIL;
  } else {
    // RESET_ALL
    if (!INCLUDE_ADMINS) where.isInstanceAdmin = false;
  }

  const targets = await prisma.user.findMany({where, select: {id: true, email: true}});
  if (targets.length === 0) {
    log(RESET_EMAIL ? `No user found with email "${RESET_EMAIL}".` : "No matching users found.");
    process.exit(1);
  }

  log(
    `${DRY_RUN ? "[DRY RUN] would reset" : "Resetting"} ${targets.length} user(s) ` +
      `to password "${RESET_PASSWORD}" (isPasswordAutoset=${KEEP_AUTOSET})`,
  );

  if (!DRY_RUN) {
    const result = await prisma.user.updateMany({
      where,
      data: {
        password: hash,
        isActive: true,
        isEmailVerified: true,
        isPasswordAutoset: KEEP_AUTOSET,
      },
    });
    log(`✅  ${result.count} user(s) updated.`);
  }

  if (targets.length <= 20) targets.forEach((u) => log(`  • ${u.email}`));

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Reset failed:", e);
  process.exit(1);
});
