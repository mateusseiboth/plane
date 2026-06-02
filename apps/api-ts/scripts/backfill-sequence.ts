/**
 * Backfill work-item sequence numbers.
 *
 * Issues created before the sequence fix all kept the schema default
 * (sequence_id = 0), so every item rendered as PROJ-0. This script renumbers
 * issues whose sequence_id is still 0, per project, ordered by creation time,
 * continuing after the highest non-zero sequence already in that project.
 *
 * Idempotent: once every issue has a non-zero sequence, re-runs are no-ops.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun run scripts/backfill-sequence.ts
 *
 * Options (env vars):
 *   DRY_RUN=true        - Report what would change, write nothing
 *   WORKSPACE_SLUG=...   - Restrict to a single workspace (default: all)
 */

import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {Pool} from "pg";

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pool)});

const DRY_RUN = process.env.DRY_RUN === "true";
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG;

function log(msg: string) {
  console.log(`[backfill-seq] ${msg}`);
}

async function main() {
  log(`Starting${DRY_RUN ? " (DRY RUN)" : ""}`);

  const workspaceFilter = WORKSPACE_SLUG
    ? (await prisma.workspace.findFirst({where: {slug: WORKSPACE_SLUG, deletedAt: null}, select: {id: true}}))?.id
    : undefined;
  if (WORKSPACE_SLUG && !workspaceFilter) {
    log(`Workspace '${WORKSPACE_SLUG}' not found.`);
    process.exit(1);
  }

  const projects = await prisma.project.findMany({
    where: {deletedAt: null, ...(workspaceFilter ? {workspaceId: workspaceFilter} : {})},
    select: {id: true, identifier: true},
  });
  log(`Scanning ${projects.length} project(s)`);

  let totalFixed = 0;
  for (const project of projects) {
    // Issues stuck at sequence 0 (oldest first so numbering follows creation order).
    const zeros = await prisma.issue.findMany({
      where: {projectId: project.id, sequenceId: 0},
      orderBy: [{createdAt: "asc"}, {id: "asc"}],
      select: {id: true},
    });
    if (zeros.length === 0) continue;

    // Continue after the highest sequence already assigned in this project.
    const maxNonZero = await prisma.issue.aggregate({
      where: {projectId: project.id, sequenceId: {gt: 0}},
      _max: {sequenceId: true},
    });
    let next = (maxNonZero._max.sequenceId ?? 0) + 1;

    log(`  ${project.identifier}: ${zeros.length} item(s) → ${project.identifier}-${next}..${next + zeros.length - 1}`);
    if (!DRY_RUN) {
      for (const z of zeros) {
        await prisma.issue.update({where: {id: z.id}, data: {sequenceId: next}});
        next++;
      }
    }
    totalFixed += zeros.length;
  }

  log(`Done. ${totalFixed} issue(s) ${DRY_RUN ? "would be" : ""} renumbered.`);
  if (DRY_RUN) log("⚠️  DRY RUN — nothing was written");

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
