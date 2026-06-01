/**
 * Seed script — cria usuário admin e workspace padrão.
 * Idempotente: roda sem erros se já existir.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun run scripts/seed.ts
 */

import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {Pool} from "pg";
import {seedWorkflowRoles} from "../src/utils/permissions";
import {ensureProjectDefaults} from "../src/utils/project-defaults";

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pool)});

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@plane.so";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Admin";
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const WORKSPACE_NAME = process.env.WORKSPACE_NAME ?? "Quality Workspace";

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

async function main() {
  log(`Starting seed...`);

  // 1. Create or update admin user
  const hash = await Bun.password.hash(ADMIN_PASSWORD, {algorithm: "bcrypt", cost: 12});

  let admin = await prisma.user.findUnique({where: {email: ADMIN_EMAIL}});
  if (admin) {
    admin = await prisma.user.update({
      where: {email: ADMIN_EMAIL},
      data: {
        password: hash,
        isSuperuser: true,
        isStaff: true,
        isInstanceAdmin: true,
        isActive: true,
        isEmailVerified: true,
        displayName: ADMIN_NAME,
        firstName: ADMIN_NAME,
        language: "pt-BR",
      },
    });
    log(`✅  Admin user updated: ${ADMIN_EMAIL}`);
  } else {
    admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        username: "admin",
        password: hash,
        firstName: ADMIN_NAME,
        lastName: "",
        displayName: ADMIN_NAME,
        isSuperuser: true,
        isStaff: true,
        isInstanceAdmin: true,
        isActive: true,
        isEmailVerified: true,
        language: "pt-BR",
      },
    });
    log(`✅  Admin user created: ${ADMIN_EMAIL}`);
  }

  // 2. Create or update the Instance record (required by frontend)
  const existingInstance = await prisma.instance.findFirst();
  if (!existingInstance) {
    await prisma.instance.create({
      data: {
        instanceName: "Plane",
        instanceId: `plane-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        currentVersion: "0.23-dev",
        edition: "PLANE_COMMUNITY",
        domain: "",
        isSetupDone: true,
        isSignupScreenVisited: true,
        isTelemetryEnabled: false,
        isSupportRequired: false,
        // SLA: ajuste de prazo (horas corridas) por prioridade — totalmente editável (C2)
        configurations: {priority_sla: {urgent: -8, high: -4, medium: 0, low: 8, none: 0}},
      },
    });
    log(`✅  Instance record created`);
  } else {
    const cfg = (existingInstance.configurations as any) ?? {};
    if (!cfg.priority_sla) cfg.priority_sla = {urgent: -8, high: -4, medium: 0, low: 8, none: 0};
    await prisma.instance.update({
      where: {id: existingInstance.id},
      data: {isSetupDone: true, isSignupScreenVisited: true, configurations: cfg},
    });
    log(`✅  Instance updated (setup done + priority_sla ensured)`);
  }

  // 3. Create default workspace if doesn't exist
  let workspace = await prisma.workspace.findFirst({where: {slug: WORKSPACE_SLUG}});
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: WORKSPACE_NAME,
        slug: WORKSPACE_SLUG,
        timezone: "America/Sao_Paulo",
      },
    });
    log(`✅  Workspace created: ${WORKSPACE_NAME} (${WORKSPACE_SLUG})`);
  } else {
    log(`ℹ️   Workspace already exists: ${WORKSPACE_SLUG}`);
  }

  // 3. Add admin as workspace owner (role=20)
  const existing = await prisma.workspaceMember.findFirst({
    where: {workspaceId: workspace.id, memberId: admin.id, deletedAt: null},
  });
  if (!existing) {
    await prisma.workspaceMember.create({
      data: {workspaceId: workspace.id, memberId: admin.id, role: 20, isActive: true},
    });
    log(`✅  Admin added as workspace owner`);
  }

  // 3b. Seed configurable roles (system roles + default visibility/transitions)
  const roleIds = await seedWorkflowRoles(prisma, workspace.id);
  log(`✅  Workflow roles seeded (${Object.keys(roleIds).length} roles)`);

  // 3c. Normalize every existing project: pt-BR states, intake enabled, default labels.
  // Runs without MySQL, so the seeder (executed on every start) keeps projects correct.
  const norm = await ensureProjectDefaults(prisma, workspace.id);
  log(
    `✅  Projects normalized: ${norm.projects} project(s), ` +
      `${norm.statesRenamed} state(s) renamed, ${norm.statesCreated} created, ` +
      `${norm.intakesCreated} intake(s), ${norm.labelsCreated} label(s)`
  );

  // Projects are created by the SAC migration script (one per sistema).
  // Seed does not create projects — run scripts/migrate-sac.ts after seeding.
  log(`ℹ️   Projects are created by migrate-sac.ts (one per sistema).`);

  await prisma.$disconnect();
  await pool.end();

  log("");
  log("═══════════════════════════════════════════════════════");
  log("  Seed completo!");
  log(`  Admin email:    ${ADMIN_EMAIL}`);
  log(`  Admin senha:    ${ADMIN_PASSWORD}`);
  log(`  Workspace:      ${WORKSPACE_NAME} (/${WORKSPACE_SLUG})`);
  log("═══════════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
