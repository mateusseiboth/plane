/**
 * Test factories — mirrors pytest fixtures in apps/api/plane/tests/conftest.py
 * Uses Prisma directly (same DB as the running API) to create seed data.
 */
import { randomUUID } from "crypto";
import {prismaReal} from "@tests/helpers/prisma-real";

// `prisma` aqui é sempre o cliente real — ver prisma-real.ts.
const prisma = new Proxy({} as any, {get: (_, chave) => (prismaReal() as any)[chave]});

export async function createUser(overrides: Partial<{
  email: string;
  displayName: string;
  firstName: string;
  lastName: string;
}> = {}) {
  const id = randomUUID().replace(/-/g, "").slice(0, 8);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${id}@plane.test`,
      username: `user_${id}`,
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
      displayName: overrides.displayName ?? `TestUser_${id}`,
      isActive: true,
    },
  });
}

export async function createApiToken(userId: string, token?: string) {
  return prisma.apiToken.create({
    data: {
      userId,
      label: "Test Token",
      token: token ?? `test-token-${randomUUID()}`,
      isActive: true,
    },
  });
}

export async function createWorkspace(ownerId: string, overrides: Partial<{
  name: string;
  slug: string;
}> = {}) {
  const id = randomUUID().replace(/-/g, "").slice(0, 8);
  const slug = overrides.slug ?? `ws-${id}`;
  const ws = await prisma.workspace.create({
    data: {
      name: overrides.name ?? `Workspace ${id}`,
      slug,
      timezone: "UTC",
    },
  });

  await prisma.workspaceMember.create({
    data: { workspaceId: ws.id, memberId: ownerId, role: 20, isActive: true },
  });

  return ws;
}

export async function createProject(
  workspaceId: string,
  userId: string,
  overrides: Partial<{ name: string; identifier: string; cycleView: boolean }> = {}
) {
  const id = randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  const project = await prisma.project.create({
    data: {
      workspaceId,
      name: overrides.name ?? `Project ${id}`,
      identifier: overrides.identifier ?? id,
      cycleView: overrides.cycleView ?? false,
      createdById: userId,
    },
  });

  await prisma.projectMember.create({
    data: { projectId: project.id, workspaceId, memberId: userId, role: 20, isActive: true },
  });

  // Default states
  const defaultStates = [
    { name: "Backlog", color: "#ff782c", group: "backlog", sequence: 15000, isDefault: true },
    { name: "Todo", color: "#eb5757", group: "unstarted", sequence: 30000 },
    { name: "In Progress", color: "#f59e0b", group: "started", sequence: 45000 },
    { name: "Done", color: "#16a34a", group: "completed", sequence: 60000 },
    { name: "Cancelled", color: "#dc2626", group: "cancelled", sequence: 75000 },
  ];

  await prisma.state.createMany({
    data: defaultStates.map((s) => ({
      projectId: project.id,
      workspaceId,
      name: s.name,
      color: s.color,
      group: s.group,
      sequence: s.sequence,
      default: s.isDefault ?? false,
      slug: s.name.toLowerCase().replace(/\s+/g, "-"),
    })),
  });

  return project;
}

export async function createCycle(
  projectId: string,
  workspaceId: string,
  ownedById: string,
  overrides: Partial<{ name: string; startDate: Date; endDate: Date }> = {}
) {
  return prisma.cycle.create({
    data: {
      projectId,
      workspaceId,
      ownedById,
      name: overrides.name ?? "Test Cycle",
      startDate: overrides.startDate ?? null,
      endDate: overrides.endDate ?? null,
    },
  });
}

export async function createIssue(
  projectId: string,
  workspaceId: string,
  overrides: Partial<{
    name: string;
    stateId: string;
    priority: string;
    createdById: string;
    entityId: string;
    startDate: Date;
    targetDate: Date;
    sequenceId: number;
    parentId: string;
    legacyTicketNumber: string;
    descriptionStripped: string;
  }> = {}
) {
  return prisma.issue.create({
    data: {
      projectId,
      workspaceId,
      name: overrides.name ?? "Test Issue",
      priority: overrides.priority ?? "none",
      stateId: overrides.stateId ?? null,
      createdById: overrides.createdById ?? null,
      entityId: overrides.entityId ?? null,
      startDate: overrides.startDate ?? null,
      targetDate: overrides.targetDate ?? null,
      sequenceId: overrides.sequenceId ?? 0,
      parentId: overrides.parentId ?? null,
      legacyTicketNumber: overrides.legacyTicketNumber ?? null,
      descriptionStripped: overrides.descriptionStripped ?? "",
    },
  });
}

// ── Helpers usados pelos testes de listagem/filtro ────────────────────────────
// Ficam aqui (e não duplicados em cada arquivo de teste) porque montar o cenário
// de um filtro exige quase sempre os mesmos vínculos.

/** Estados criados por createProject, indexados por nome. */
export async function projectStates(projectId: string) {
  const states = await prisma.state.findMany({ where: { projectId, deletedAt: null }, orderBy: { sequence: "asc" } });
  return {
    all: states,
    byName: new Map(states.map((s) => [s.name, s])),
    byGroup: (group: string) => states.filter((s) => s.group === group),
  };
}

export async function createState(
  projectId: string,
  workspaceId: string,
  overrides: Partial<{ name: string; group: string; sequence: number; isTriage: boolean }> = {}
) {
  const name = overrides.name ?? `State ${randomUUID().slice(0, 6)}`;
  return prisma.state.create({
    data: {
      projectId,
      workspaceId,
      name,
      group: overrides.group ?? "backlog",
      sequence: overrides.sequence ?? 90000,
      isTriage: overrides.isTriage ?? false,
      color: "#111111",
      slug: name.toLowerCase().replace(/\s+/g, "-"),
    },
  });
}

export async function createLabel(
  projectId: string,
  workspaceId: string,
  overrides: Partial<{ name: string; color: string; slaHours: number | null }> = {}
) {
  return prisma.label.create({
    data: {
      projectId,
      workspaceId,
      name: overrides.name ?? `Label ${randomUUID().slice(0, 6)}`,
      color: overrides.color ?? "#dc2626",
      slaHours: overrides.slaHours ?? null,
    },
  });
}

export async function addLabelToIssue(issueId: string, labelId: string, projectId: string, workspaceId: string) {
  return prisma.issueLabel.create({ data: { issueId, labelId, projectId, workspaceId } });
}

export async function addAssignee(issueId: string, assigneeId: string, projectId: string, workspaceId: string) {
  return prisma.issueAssignee.create({ data: { issueId, assigneeId, projectId, workspaceId } });
}

export async function addSubscriber(issueId: string, subscriberId: string, projectId: string, workspaceId: string) {
  return prisma.issueSubscriber.create({ data: { issueId, subscriberId, projectId, workspaceId } });
}

export async function addMention(issueId: string, mentionId: string, projectId: string, workspaceId: string) {
  return prisma.issueMention.create({ data: { issueId, mentionId, projectId, workspaceId } });
}

export async function createEntity(
  workspaceId: string,
  overrides: Partial<{ name: string; entityType: number; city: string; state: string; isActive: boolean; cnpj: string }> = {}
) {
  return prisma.entity.create({
    data: {
      workspaceId,
      name: overrides.name ?? `Entity ${randomUUID().slice(0, 6)}`,
      entityType: overrides.entityType ?? 1,
      city: overrides.city ?? null,
      state: overrides.state ?? null,
      cnpj: overrides.cnpj ?? null,
      isActive: overrides.isActive ?? true,
    },
  });
}

/** Caixa de intake do projeto (cria se ainda não existir). */
export async function ensureIntake(projectId: string, workspaceId: string) {
  const existing = await prisma.intake.findFirst({ where: { projectId, deletedAt: null } });
  if (existing) return existing;
  return prisma.intake.create({ data: { projectId, workspaceId, name: "Intake", isActive: true } });
}

export async function createIntakeIssue(
  projectId: string,
  workspaceId: string,
  overrides: Partial<{ name: string; status: number; stateId: string; createdById: string; source: string }> = {}
) {
  const intake = await ensureIntake(projectId, workspaceId);
  const issue = await createIssue(projectId, workspaceId, {
    name: overrides.name ?? "Intake Issue",
    ...(overrides.stateId ? { stateId: overrides.stateId } : {}),
    ...(overrides.createdById ? { createdById: overrides.createdById } : {}),
  });
  const link = await prisma.intakeIssue.create({
    data: {
      intakeId: intake.id,
      issueId: issue.id,
      projectId,
      workspaceId,
      status: overrides.status ?? -2,
      source: overrides.source ?? "in-app",
      createdById: overrides.createdById ?? null,
    },
  });
  return { intake, issue, link };
}

export async function createTechnicalVisit(
  workspaceId: string,
  overrides: Partial<{
    technicianId: string;
    entityId: string;
    status: number;
    scheduledDate: Date;
    city: string;
    visitNumber: string;
  }> = {}
) {
  return prisma.technicalVisit.create({
    data: {
      workspaceId,
      technicianId: overrides.technicianId ?? null,
      entityId: overrides.entityId ?? null,
      status: overrides.status ?? 0,
      scheduledDate: overrides.scheduledDate ?? null,
      city: overrides.city ?? null,
      visitNumber: overrides.visitNumber ?? null,
    },
  });
}

export async function createSticky(workspaceId: string, ownerId: string, overrides: Partial<{ title: string; color: string }> = {}) {
  return prisma.sticky.create({
    data: {
      workspaceId,
      ownerId,
      title: overrides.title ?? "Nota",
      color: overrides.color ?? "#ffffff",
    },
  });
}

export async function createModule(
  projectId: string,
  workspaceId: string,
  overrides: Partial<{ name: string; status: string; leadId: string }> = {}
) {
  return prisma.module.create({
    data: {
      projectId,
      workspaceId,
      name: overrides.name ?? `Module ${randomUUID().slice(0, 6)}`,
      status: overrides.status ?? "backlog",
      leadId: overrides.leadId ?? null,
    },
  });
}

/** Adiciona um usuário ao workspace (e opcionalmente ao projeto) com um papel. */
export async function addMember(
  workspaceId: string,
  memberId: string,
  role: number,
  projectId?: string,
  projectRole?: number
) {
  await prisma.workspaceMember.create({ data: { workspaceId, memberId, role, isActive: true } });
  if (projectId) {
    await prisma.projectMember.create({
      data: { projectId, workspaceId, memberId, role: projectRole ?? role, isActive: true },
    });
  }
}

/** Usuário + token + associação a um workspace/projeto existentes, em uma chamada. */
export async function createMemberWithToken(
  workspaceId: string,
  role: number,
  projectId?: string,
  projectRole?: number
) {
  const user = await createUser();
  const token = await createApiToken(user.id);
  await addMember(workspaceId, user.id, role, projectId, projectRole);
  return { user, token: token.token };
}

/**
 * Base da API sob teste. Os testes apagam o banco (cleanDb), então aponte
 * API_BASE_URL para uma instância dedicada ao banco de teste — nunca para a
 * instância de desenvolvimento com dados migrados.
 */
export const TEST_API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:8001").replace(/\/$/, "");

/** Returns a fetch-compatible client that sends X-Api-Key header */
export function apiClient(token: string, baseUrl = `${TEST_API_BASE_URL}/api/v1`) {
  return {
    async get(path: string) {
      return fetch(`${baseUrl}${path}`, {
        headers: { "X-Api-Key": token, "Content-Type": "application/json" },
      });
    },
    async post(path: string, body: unknown) {
      return fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "X-Api-Key": token, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    async patch(path: string, body: unknown) {
      return fetch(`${baseUrl}${path}`, {
        method: "PATCH",
        headers: { "X-Api-Key": token, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    async delete(path: string) {
      return fetch(`${baseUrl}${path}`, {
        method: "DELETE",
        headers: { "X-Api-Key": token, "Content-Type": "application/json" },
      });
    },
  };
}
