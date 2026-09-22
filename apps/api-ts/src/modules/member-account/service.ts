// Admin cria a conta de alguém direto, com senha, papel e sistemas, sem passar
// pelo convite. Mesmo resultado de aceitar um convite e depois ajustar papel e
// sistemas, só que numa operação.

import prisma from "@db";
import { MIN_PASSWORD_LENGTH } from "@modules/auth/password-reset";
import { createFieldError } from "@utils/field-error";
import { DEFAULT_ROLES } from "@utils/permissions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,60}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BCRYPT = { algorithm: "bcrypt", cost: 12 } as const;

export type NewMemberInput = {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  displayName: string;
  password: string;
  role: number;
  projectIds: string[];
};

function readText(value: unknown): string {
  return String(value ?? "").trim();
}

function readEmail(value: unknown): string {
  const email = readText(value).toLowerCase();
  if (!EMAIL_RE.test(email)) throw createFieldError("email", "Informe um e-mail válido.");
  return email;
}

/** Sem nome de usuário informado, sai da parte antes do @ do e-mail. */
function readUsername(value: unknown, email: string): string {
  const username = readText(value) || email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "_");
  if (!USERNAME_RE.test(username)) {
    throw createFieldError("username", "Use de 3 a 60 letras, números, ponto, hífen ou sublinhado.");
  }
  return username;
}

function readPassword(value: unknown): string {
  const password = typeof value === "string" ? value : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw createFieldError("password", `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  return password;
}

export function readNewMemberInput(body: any): NewMemberInput {
  const email = readEmail(body?.email);
  const firstName = readText(body?.first_name);
  if (!firstName) throw createFieldError("first_name", "Informe o nome.");
  const lastName = readText(body?.last_name);
  return {
    email,
    username: readUsername(body?.username, email),
    firstName,
    lastName,
    displayName: readText(body?.display_name) || `${firstName} ${lastName}`.trim(),
    password: readPassword(body?.password),
    role: Number(body?.role),
    projectIds: Array.isArray(body?.project_ids) ? [...new Set<string>(body.project_ids.map(String))] : [],
  };
}

/** Papel aceito: o de uma função padrão ou de uma função criada neste espaço. */
async function findRoleForLevel(workspaceId: string, level: number) {
  const gravada = await prisma.workflowRole.findFirst({ where: { workspaceId, level, deletedAt: null } });
  const padrao = DEFAULT_ROLES.some((r) => r.level === level);
  if (!gravada && !padrao) throw createFieldError("role", "Escolha um papel existente.");
  return gravada;
}

async function requireProjects(workspaceId: string, projectIds: string[]) {
  if (projectIds.length === 0) return;
  const invalid = projectIds.some((id) => !UUID_RE.test(id));
  const found = invalid
    ? 0
    : await prisma.project.count({ where: { id: { in: projectIds }, workspaceId, deletedAt: null } });
  if (found !== projectIds.length) throw createFieldError("project_ids", "Sistema inválido.");
}

async function requireUniqueAccount(email: string, username: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
    select: { email: true },
  });
  if (!existing) return;
  const path = existing.email === email ? "email" : "username";
  const message = path === "email" ? "Já existe um usuário com este e-mail." : "Este nome de usuário já está em uso.";
  throw { ...createFieldError(path, message), status: 409 };
}

export async function createMemberAccount(workspaceId: string, input: NewMemberInput) {
  const funcao = await findRoleForLevel(workspaceId, input.role);
  await requireProjects(workspaceId, input.projectIds);
  await requireUniqueAccount(input.email, input.username);
  const password = await Bun.password.hash(input.password, BCRYPT);
  const workflowRoleId = funcao?.id ?? null;

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: input.displayName,
        password,
        // `isPasswordAutoset=false` impede que o seeder sobrescreva a senha definida aqui.
        isPasswordAutoset: false,
        isActive: true,
        isEmailVerified: true,
        language: "pt-BR",
      },
    });
    await tx.workspaceMember.create({
      data: { workspaceId, memberId: user.id, role: input.role, workflowRoleId, isActive: true },
    });
    await tx.projectMember.createMany({
      data: input.projectIds.map((projectId) => ({
        projectId,
        workspaceId,
        memberId: user.id,
        role: input.role,
        workflowRoleId,
        isActive: true,
      })),
    });
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      display_name: user.displayName,
      role: input.role,
      project_ids: input.projectIds,
    };
  });
}
