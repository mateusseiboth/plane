/**
 * Catálogo de papéis configuráveis (H1–H3). Os níveis são estruturais:
 * resolveRole() casa a coluna `role` (Int) da associação com o `level` do
 * WorkflowRole, então um nível divergente desliga silenciosamente o workflow.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {
  ALL_ACTIONS,
  DEFAULT_ROLES,
  DEFAULT_TRANSITIONS,
  DEFAULT_VISIBILITY,
  EProjectAction,
  STATE,
  roleCan,
  defaultRoleForLevel,
  seedWorkflowRoles,
  type EffectiveRole,
} from "@utils/permissions";

const role = (key: string) => DEFAULT_ROLES.find((r) => r.key === key)!;

describe("DEFAULT_ROLES", () => {
  it("define os 7 papéis do sistema com os níveis do enum legado", () => {
    expect(DEFAULT_ROLES.map((r) => [r.key, r.level])).toEqual([
      ["guest", 5],
      ["atendimento", 6],
      ["qualidade", 8],
      ["member", 15],
      ["ti", 12],
      ["gestor_projeto", 18],
      ["admin", 20],
    ]);
  });

  it("admin concentra todas as ações do catálogo", () => {
    expect(role("admin").permissions).toEqual(ALL_ACTIONS);
  });

  it("Visualizador só lê", () => {
    expect(role("guest").permissions).toEqual([
      EProjectAction.ISSUE_VIEW,
      EProjectAction.COMMENT_READ,
      EProjectAction.ATTACHMENT_VIEW,
    ]);
  });

  it("Atendimento abre intake mas nunca cria/edita work item", () => {
    const atendimento = role("atendimento").permissions;
    expect(atendimento).toContain(EProjectAction.INTAKE_CREATE);
    expect(atendimento).toContain(EProjectAction.COMMENT_CREATE);
    expect(atendimento).not.toContain(EProjectAction.ISSUE_CREATE);
    expect(atendimento).not.toContain(EProjectAction.ISSUE_EDIT_OWN);
  });

  it("apenas admin e Gestor movem estados livremente", () => {
    const livres = DEFAULT_ROLES.filter((r) => r.permissions.includes(EProjectAction.STATE_MOVE_UNRESTRICTED));
    expect(livres.map((r) => r.key).sort()).toEqual(["admin", "gestor_projeto"]);
  });

  it("member permanece no nível 15 (espelha EUserPermissions.MEMBER)", () => {
    expect(role("member").level).toBe(15);
  });
});

describe("defaultRoleForLevel", () => {
  it("escolhe pelo nível, não pela ordem de declaração da lista", () => {
    // member(15) é declarado ANTES de ti(12); varrer a lista invertida devolvia
    // "ti" para o nível 15 e transformava todo membro em TI.
    expect(defaultRoleForLevel(15).key).toBe("member");
    expect(defaultRoleForLevel(12).key).toBe("ti");
  });

  it("casa o nível exato de cada papel do sistema", () => {
    for (const def of DEFAULT_ROLES) {
      expect(defaultRoleForLevel(def.level).key).toBe(def.key);
    }
  });

  it("arredonda para baixo em níveis intermediários", () => {
    expect(defaultRoleForLevel(19).key).toBe("gestor_projeto");
    expect(defaultRoleForLevel(14).key).toBe("ti");
    expect(defaultRoleForLevel(7).key).toBe("atendimento");
    expect(defaultRoleForLevel(100).key).toBe("admin");
  });

  it("níveis abaixo do mínimo caem no papel mais básico", () => {
    expect(defaultRoleForLevel(0).key).toBe("guest");
    expect(defaultRoleForLevel(-5).key).toBe("guest");
  });
});

describe("DEFAULT_VISIBILITY / DEFAULT_TRANSITIONS", () => {
  it("Qualidade não enxerga A Fazer nem Em Desenvolvimento", () => {
    const rules = DEFAULT_VISIBILITY.qualidade;
    expect(rules.some((r) => r.group === "unstarted")).toBe(false);
    expect(rules.some((r) => r.stateName === STATE.EM_DESENVOLVIMENTO)).toBe(false);
    expect(rules.some((r) => r.stateName === STATE.EM_ANALISE)).toBe(true);
  });

  it("TI não enxerga Em Análise (faixa da Qualidade)", () => {
    const rules = DEFAULT_VISIBILITY.ti;
    expect(rules.some((r) => r.stateName === STATE.EM_ANALISE)).toBe(false);
    expect(rules.some((r) => r.stateName === STATE.EM_DESENVOLVIMENTO)).toBe(true);
  });

  it("Atendimento só vê triagem e os desfechos", () => {
    expect(DEFAULT_VISIBILITY.atendimento.map((r) => r.group).sort()).toEqual([
      "cancelled",
      "completed",
      "triage",
    ]);
  });

  it("papéis irrestritos não têm regras de visibilidade (veem tudo)", () => {
    expect(DEFAULT_VISIBILITY.admin).toBeUndefined();
    expect(DEFAULT_VISIBILITY.gestor_projeto).toBeUndefined();
  });

  it("Atendimento só transita dentro da triagem", () => {
    expect(DEFAULT_TRANSITIONS.atendimento).toEqual([{fromGroup: "triage", toGroup: "triage"}]);
  });

  it("guest não tem nenhuma transição", () => {
    expect(DEFAULT_TRANSITIONS.guest).toBeUndefined();
  });
});

describe("roleCan", () => {
  const build = (permissions: string[]): EffectiveRole => ({id: "r", key: "x", level: 10, permissions});

  it("responde conforme a lista de permissões efetiva", () => {
    const r = build([EProjectAction.ISSUE_VIEW]);
    expect(roleCan(r, EProjectAction.ISSUE_VIEW)).toBe(true);
    expect(roleCan(r, EProjectAction.ISSUE_CREATE)).toBe(false);
  });

  it("papel sem permissões nega tudo", () => {
    expect(roleCan(build([]), EProjectAction.COMMENT_READ)).toBe(false);
  });
});

describe("seedWorkflowRoles", () => {
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    await createProject(ws.id, user.id);
  });

  afterAll(() => cleanDb());

  it("cria os 7 papéis com as regras padrão", async () => {
    const keyToId = await seedWorkflowRoles(prisma, workspaceId);
    expect(Object.keys(keyToId).sort()).toEqual(DEFAULT_ROLES.map((r) => r.key).sort());

    const roles = await prisma.workflowRole.findMany({where: {workspaceId}});
    expect(roles).toHaveLength(7);
    expect(roles.every((r) => r.isSystem)).toBe(true);

    const qualidade = roles.find((r) => r.key === "qualidade")!;
    expect(await prisma.roleStateVisibility.count({where: {roleId: qualidade.id}})).toBe(
      DEFAULT_VISIBILITY.qualidade.length,
    );
    expect(await prisma.roleStateTransition.count({where: {roleId: qualidade.id}})).toBe(
      DEFAULT_TRANSITIONS.qualidade.length,
    );
  });

  it("vincula uma associação nível 15 ao papel Membro (não ao de TI)", async () => {
    const membro = await createUser();
    await prisma.workspaceMember.create({
      data: {workspaceId, memberId: membro.id, role: 15, isActive: true},
    });
    await seedWorkflowRoles(prisma, workspaceId);
    const memberRole = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "member"}});
    const link = await prisma.workspaceMember.findFirstOrThrow({where: {workspaceId, memberId: membro.id}});
    expect(link.workflowRoleId).toBe(memberRole.id);
  });

  it("vincula as associações existentes ao papel correspondente ao nível", async () => {
    const admin = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "admin"}});
    const membership = await prisma.workspaceMember.findFirstOrThrow({where: {workspaceId, memberId: userId}});
    expect(membership.workflowRoleId).toBe(admin.id);

    const projectMembership = await prisma.projectMember.findFirstOrThrow({where: {workspaceId, memberId: userId}});
    expect(projectMembership.workflowRoleId).toBe(admin.id);
  });

  it("é idempotente e não duplica papéis nem regras", async () => {
    await seedWorkflowRoles(prisma, workspaceId);
    expect(await prisma.workflowRole.count({where: {workspaceId}})).toBe(7);
    const qualidade = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "qualidade"}});
    expect(await prisma.roleStateVisibility.count({where: {roleId: qualidade.id}})).toBe(
      DEFAULT_VISIBILITY.qualidade.length,
    );
  });

  it("realinha o `level` de um papel de sistema que tenha derivado", async () => {
    const ti = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "ti"}});
    await prisma.workflowRole.update({where: {id: ti.id}, data: {level: 99}});
    await seedWorkflowRoles(prisma, workspaceId);
    const after = await prisma.workflowRole.findFirstOrThrow({where: {id: ti.id}});
    expect(after.level).toBe(12);
  });

  it("preserva permissões editadas pelo admin (sem RESEED_WORKFLOW)", async () => {
    const guest = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "guest"}});
    await prisma.workflowRole.update({where: {id: guest.id}, data: {permissions: ["issue.view"]}});
    await seedWorkflowRoles(prisma, workspaceId);
    const after = await prisma.workflowRole.findFirstOrThrow({where: {id: guest.id}});
    expect(after.permissions).toEqual(["issue.view"]);
  });

  it("RESEED_WORKFLOW=true devolve os defaults do código", async () => {
    process.env.RESEED_WORKFLOW = "true";
    try {
      await seedWorkflowRoles(prisma, workspaceId);
      const guest = await prisma.workflowRole.findFirstOrThrow({where: {workspaceId, key: "guest"}});
      expect(guest.permissions).toEqual(role("guest").permissions);
    } finally {
      delete process.env.RESEED_WORKFLOW;
    }
  });
});
