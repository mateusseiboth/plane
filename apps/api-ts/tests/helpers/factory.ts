/**
 * Test factories — mirrors pytest fixtures in apps/api/plane/tests/conftest.py
 * Uses Prisma directly (same DB as the running API) to create seed data.
 */
import { randomUUID } from "crypto";
import prisma from "@db";

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
  overrides: Partial<{ name: string; stateId: string; priority: string }> = {}
) {
  return prisma.issue.create({
    data: {
      projectId,
      workspaceId,
      name: overrides.name ?? "Test Issue",
      priority: overrides.priority ?? "none",
      stateId: overrides.stateId ?? null,
    },
  });
}

/** Returns a fetch-compatible client that sends X-Api-Key header */
export function apiClient(token: string, baseUrl = "http://localhost:8001/api/v1") {
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
