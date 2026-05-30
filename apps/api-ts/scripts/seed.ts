/**
 * Seed script — cria usuário admin e workspace padrão.
 * Idempotente: roda sem erros se já existir.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... bun run scripts/seed.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@plane.so";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "admin";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Admin";
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "main";
const WORKSPACE_NAME = process.env.WORKSPACE_NAME ?? "Main Workspace";

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

async function main() {
  log(`Starting seed...`);

  // 1. Create or update admin user
  const hash = await Bun.password.hash(ADMIN_PASSWORD, { algorithm: "bcrypt", cost: 12 });

  let admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (admin) {
    admin = await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        password: hash,
        isSuperuser: true,
        isStaff: true,
        isInstanceAdmin: true,
        isActive: true,
        isEmailVerified: true,
        displayName: ADMIN_NAME,
        firstName: ADMIN_NAME,
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
      },
    });
    log(`✅  Instance record created`);
  } else if (!existingInstance.isSetupDone) {
    await prisma.instance.update({
      where: { id: existingInstance.id },
      data: { isSetupDone: true, isSignupScreenVisited: true },
    });
    log(`✅  Instance marked as setup done`);
  } else {
    log(`ℹ️   Instance already exists`);
  }

  // 3. Create default workspace if doesn't exist
  let workspace = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG } });
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
    where: { workspaceId: workspace.id, memberId: admin.id, deletedAt: null },
  });
  if (!existing) {
    await prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, memberId: admin.id, role: 20, isActive: true },
    });
    log(`✅  Admin added as workspace owner`);
  }

  // 4. Create a default project "SAC" in the workspace
  let project = await prisma.project.findFirst({
    where: { workspaceId: workspace.id, identifier: "SAC", deletedAt: null },
  });
  if (!project) {
    project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          workspaceId: workspace!.id,
          name: "SAC - Suporte ao Cliente",
          identifier: "SAC",
          description: "Chamados migrados do sistema SAC legado",
          network: 2,
          cycleView: true,
          moduleView: true,
          pageView: true,
          createdById: admin!.id,
        },
      });

      // Default states
      await tx.state.createMany({
        data: [
          { projectId: p.id, workspaceId: workspace!.id, name: "Aguardando Resposta", color: "#f59e0b", group: "started",   sequence: 10000, slug: "aguardando-resposta" },
          { projectId: p.id, workspaceId: workspace!.id, name: "Em Andamento",        color: "#3b82f6", group: "started",   sequence: 20000, slug: "em-andamento" },
          { projectId: p.id, workspaceId: workspace!.id, name: "Respondido",          color: "#8b5cf6", group: "started",   sequence: 30000, slug: "respondido" },
          { projectId: p.id, workspaceId: workspace!.id, name: "Encerrado",           color: "#16a34a", group: "completed", sequence: 40000, slug: "encerrado",  default: true },
          { projectId: p.id, workspaceId: workspace!.id, name: "Encerrado Parcialmente", color: "#65a30d", group: "completed", sequence: 50000, slug: "encerrado-parcialmente" },
          { projectId: p.id, workspaceId: workspace!.id, name: "Visita Técnica",      color: "#f97316", group: "started",   sequence: 60000, slug: "visita-tecnica" },
          { projectId: p.id, workspaceId: workspace!.id, name: "Backlog",             color: "#94a3b8", group: "backlog",   sequence: 70000, slug: "backlog" },
        ],
      });

      await tx.projectMember.create({
        data: { projectId: p.id, workspaceId: workspace!.id, memberId: admin!.id, role: 20, isActive: true },
      });

      return p;
    });
    log(`✅  Project "SAC" created`);
  } else {
    log(`ℹ️   Project SAC already exists`);
  }

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
