/**
 * Cria (ou atualiza) um usuário e o vincula a um workspace com o papel informado.
 * Útil para criar contas de teste/operacionais sem passar pelo fluxo de convite.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... \
 *   USER_EMAIL=atendimento@quality.local \
 *   USER_PASSWORD=atendimento \
 *   USER_NAME="Atendimento" \
 *   USER_ROLE=6 \
 *   WORKSPACE_SLUG=quality \
 *   bun run scripts/create-user.ts
 *
 * Papéis: 20=Admin, 18=Gestor de Projeto, 15=Membro, 12=TI, 8=Qualidade,
 *         6=Atendimento, 5=Convidado.
 * O papel no workspace é limitado a 15 (regra do próprio produto), exceto Admin.
 */

import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {Pool} from "pg";

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pool)});

const EMAIL = process.env.USER_EMAIL ?? "";
const PASSWORD = process.env.USER_PASSWORD ?? "teste";
const NAME = process.env.USER_NAME ?? EMAIL.split("@")[0];
const ROLE = Number(process.env.USER_ROLE ?? 15);
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const ALL_PROJECTS = process.env.ALL_PROJECTS !== "false";

function log(msg: string) {
  console.log(`[create-user] ${msg}`);
}

function usernameFrom(email: string): string {
  return email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "_");
}

async function main() {
  if (!EMAIL) {
    log("❌  Informe USER_EMAIL.");
    process.exit(1);
  }

  const workspace = await prisma.workspace.findFirst({where: {slug: WORKSPACE_SLUG, deletedAt: null}});
  if (!workspace) {
    log(`❌  Workspace '${WORKSPACE_SLUG}' não encontrado.`);
    process.exit(1);
  }

  const password = await Bun.password.hash(PASSWORD, {algorithm: "bcrypt", cost: 12});
  // isPasswordAutoset=false impede que o seeder sobrescreva a senha definida aqui.
  const base = {
    password,
    isPasswordAutoset: false,
    isActive: true,
    isEmailVerified: true,
    displayName: NAME,
    firstName: NAME,
    language: "pt-BR",
  };

  const existing = await prisma.user.findUnique({where: {email: EMAIL}});
  const user = existing
    ? await prisma.user.update({where: {email: EMAIL}, data: base})
    : await prisma.user.create({data: {...base, email: EMAIL, username: usernameFrom(EMAIL), lastName: ""}});
  log(`✅  Usuário ${existing ? "atualizado" : "criado"}: ${EMAIL} (${user.id})`);

  // O papel de workspace é limitado a 15; papéis customizados abaixo disso permanecem.
  const workspaceRole = ROLE >= 20 ? 20 : Math.min(ROLE, 15);
  const member = await prisma.workspaceMember.findFirst({
    where: {workspaceId: workspace.id, memberId: user.id},
  });
  if (member) {
    await prisma.workspaceMember.update({
      where: {id: member.id},
      data: {role: workspaceRole, isActive: true, deletedAt: null},
    });
  } else {
    await prisma.workspaceMember.create({
      data: {workspaceId: workspace.id, memberId: user.id, role: workspaceRole, isActive: true},
    });
  }
  log(`✅  Vinculado ao workspace ${WORKSPACE_SLUG} com papel ${workspaceRole}`);

  if (ALL_PROJECTS) {
    const projects = await prisma.project.findMany({
      where: {workspaceId: workspace.id, deletedAt: null},
      select: {id: true},
    });
    let linked = 0;
    for (const project of projects) {
      const existingMember = await prisma.projectMember.findFirst({
        where: {projectId: project.id, memberId: user.id},
      });
      if (existingMember) {
        await prisma.projectMember.update({
          where: {id: existingMember.id},
          data: {role: ROLE, isActive: true, deletedAt: null},
        });
      } else {
        await prisma.projectMember.create({
          data: {projectId: project.id, workspaceId: workspace.id, memberId: user.id, role: ROLE, isActive: true},
        });
      }
      linked++;
    }
    log(`✅  Vinculado a ${linked} projeto(s) com papel ${ROLE}`);
  }

  await prisma.$disconnect();
  await pool.end();
  log(`Pronto. Login: ${EMAIL} / ${PASSWORD}`);
}

main().catch((e) => {
  console.error("[create-user] falhou:", e);
  process.exit(1);
});
