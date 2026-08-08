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
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_PASSWORD ?? "teste";
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const WORKSPACE_NAME = process.env.WORKSPACE_NAME ?? "Quality Workspace";
/**
 * Administradores da instância além do `ADMIN_EMAIL`. Entram como admin do
 * espaço de trabalho e mantêm a senha que já tiverem — o seeder roda a cada
 * `docker compose up` e não pode reverter a senha de ninguém.
 */
const ADMINS_EXTRAS = (process.env.EXTRA_ADMIN_EMAILS ?? "mateus@qualitysistemas.com.br")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Conta de Atendimento usada pelo `e2e-smoke.sh` para provar a regra D2
 * (Atendimento abre solicitação mas não cria chamado). Vinha sendo criada à
 * mão e sumia a cada reset do banco, derrubando quatro verificações do smoke
 * sem que nada estivesse quebrado de fato.
 *
 * Fora de ambiente de teste, desligue com `SEED_ATENDIMENTO=false`.
 */
const SEED_ATENDIMENTO = (process.env.SEED_ATENDIMENTO ?? "true") !== "false";
const ATENDIMENTO_EMAIL = process.env.ATENDIMENTO_EMAIL ?? "atendimento@quality.local";
const ATENDIMENTO_PASSWORD = process.env.ATENDIMENTO_PASSWORD ?? "atendimento";

function log(msg: string) {
  console.log(`[seed] ${msg}`);
}

/** Configuração de fábrica da instância. */
const DEFAULT_INSTANCE_CONFIG = () => ({
  // SLA: ajuste de prazo (horas corridas) por prioridade — totalmente editável (C2)
  priority_sla: {urgent: -8, high: -4, medium: 0, low: 8, none: 0},
  chat: {enabled: true, api_url: "", ws_url: ""},
});

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
  //
  // O chat/atendimento vem LIGADO de fábrica: é parte do fluxo de trabalho aqui,
  // e deixá-lo desligado fazia a tela de Atendimento abrir só com o aviso "o chat
  // não está habilitado". As URLs ficam vazias de propósito — o frontend resolve
  // /chat-api e /chat-ws contra a origem atual, então gravar host aqui só quebra
  // quando o sistema é aberto por outro domínio.
  const existingInstance = await prisma.instance.findFirst();
  if (!existingInstance) {
    await prisma.instance.create({
      data: {
        instanceName: process.env.INSTANCE_NAME ?? "Avião",
        instanceId: `plane-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        currentVersion: "0.23-dev",
        edition: "PLANE_COMMUNITY",
        domain: "",
        isSetupDone: true,
        isSignupScreenVisited: true,
        isTelemetryEnabled: false,
        isSupportRequired: false,
        configurations: DEFAULT_INSTANCE_CONFIG(),
      },
    });
    log(`✅  Instance record created`);
  } else {
    const cfg = (existingInstance.configurations as any) ?? {};
    const padrao = DEFAULT_INSTANCE_CONFIG();
    // Só preenche o que falta: configuração ajustada pelo admin não é sobrescrita.
    for (const [chave, valor] of Object.entries(padrao)) {
      if (cfg[chave] === undefined) cfg[chave] = valor;
    }
    // Instância criada antes da marca própria ficou com o nome do upstream. O
    // nome aparece no god-mode e nos e-mails, então corrige — mas só quando ele
    // ainda é o padrão herdado: nome escolhido pelo admin não se mexe.
    const nomeHerdado = existingInstance.instanceName === "Plane";
    await prisma.instance.update({
      where: {id: existingInstance.id},
      data: {
        isSetupDone: true,
        isSignupScreenVisited: true,
        configurations: cfg,
        ...(nomeHerdado && {instanceName: process.env.INSTANCE_NAME ?? "Avião"}),
      },
    });
    log(`✅  Instance updated (setup done + configurações padrão garantidas)`);
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

  // 3a. Administradores extras da instância.
  // Promove quem já existe (inclusive usuários vindos da migração do SAC) e cria
  // quem ainda não existe, com a senha padrão — a flag isPasswordAutoset garante
  // que ela deixa de ser tocada assim que a pessoa definir a própria.
  for (const email of ADMINS_EXTRAS) {
    const existente = await prisma.user.findUnique({where: {email}});
    const extra = existente
      ? await prisma.user.update({
          where: {email},
          data: {isSuperuser: true, isStaff: true, isInstanceAdmin: true, isActive: true, isEmailVerified: true},
        })
      : await prisma.user.create({
          data: {
            email,
            username: email.split("@")[0],
            password: await Bun.password.hash(DEFAULT_USER_PASSWORD, {algorithm: "bcrypt", cost: 12}),
            firstName: email.split("@")[0],
            displayName: email.split("@")[0],
            isPasswordAutoset: true,
            isSuperuser: true,
            isStaff: true,
            isInstanceAdmin: true,
            isActive: true,
            isEmailVerified: true,
            language: "pt-BR",
          },
        });

    const vinculo = await prisma.workspaceMember.findFirst({
      where: {workspaceId: workspace.id, memberId: extra.id, deletedAt: null},
    });
    if (vinculo) {
      if (vinculo.role !== 20) {
        await prisma.workspaceMember.update({where: {id: vinculo.id}, data: {role: 20, isActive: true}});
      }
    } else {
      await prisma.workspaceMember.create({
        data: {workspaceId: workspace.id, memberId: extra.id, role: 20, isActive: true},
      });
    }
    log(`✅  Administrador da instância: ${email}`);
  }

  // 3a2. Conta de Atendimento (nível 6) para o smoke e para demonstração.
  if (SEED_ATENDIMENTO) {
    const hashAtendimento = await Bun.password.hash(ATENDIMENTO_PASSWORD, {algorithm: "bcrypt", cost: 12});
    const existente = await prisma.user.findUnique({where: {email: ATENDIMENTO_EMAIL}});
    const atendente = existente
      ? await prisma.user.update({
          where: {email: ATENDIMENTO_EMAIL},
          data: {isActive: true, isEmailVerified: true},
        })
      : await prisma.user.create({
          data: {
            email: ATENDIMENTO_EMAIL,
            username: ATENDIMENTO_EMAIL.split("@")[0],
            password: hashAtendimento,
            firstName: "Atendimento",
            displayName: "Atendimento",
            isActive: true,
            isEmailVerified: true,
            // `false` de propósito: a senha é conhecida e não pode ser
            // sobrescrita pelo passo que reseta senhas auto-geradas.
            isPasswordAutoset: false,
            language: "pt-BR",
          },
        });

    const vinculoAtendimento = await prisma.workspaceMember.findFirst({
      where: {workspaceId: workspace.id, memberId: atendente.id, deletedAt: null},
    });
    if (vinculoAtendimento) {
      if (vinculoAtendimento.role !== 6) {
        await prisma.workspaceMember.update({where: {id: vinculoAtendimento.id}, data: {role: 6, isActive: true}});
      }
    } else {
      await prisma.workspaceMember.create({
        data: {workspaceId: workspace.id, memberId: atendente.id, role: 6, isActive: true},
      });
    }
    log(`✅  Conta de Atendimento: ${ATENDIMENTO_EMAIL}`);
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

  // 3d. Give imported users that NEVER set their own password the default one, so
  // first logins are predictable. The seeder runs on every `docker compose up`, so
  // this MUST only touch users still flagged isPasswordAutoset — otherwise a
  // password set by the user (or reset by an admin, which clears the flag) would be
  // clobbered back to the default on the next restart ("a senha não fica").
  const importedHash = await Bun.password.hash(DEFAULT_USER_PASSWORD, {algorithm: "bcrypt", cost: 12});
  const pwReset = await prisma.user.updateMany({
    where: {
      isInstanceAdmin: false,
      deletedAt: null,
      isPasswordAutoset: true,
    },
    data: {password: importedHash, isActive: true, isEmailVerified: true},
  });
  log(`✅  Auto-set (never-changed) users primed with default password "${DEFAULT_USER_PASSWORD}": ${pwReset.count} user(s)`);

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
