/**
 * Enforcement em runtime dos papéis configuráveis: resolveRole, guards de ação,
 * visibilidade de quadro e matriz de transição de estado.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {addMember, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {
  EProjectAction,
  canTransition,
  hasWorkspaceAction,
  listMemberActions,
  requireOwnOrAll,
  requireProjectAction,
  requireWorkspaceAction,
  resolveRole,
} from "@utils/permission-checks";
import {getProjectOrFail} from "@utils/workspace";
import {DEFAULT_STATES} from "@utils/project-defaults";
import {seedWorkflowRoles} from "@utils/permissions";

const catchThrown = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e as {status: number; message: string};
  }
};

describe("permission-checks", () => {
  let workspaceId: string;
  let projectId: string;
  let adminId: string;
  let tiId: string;
  let qualidadeId: string;
  let guestId: string;
  let roleIds: Record<string, string>;

  beforeAll(async () => {
    await cleanDb();
    const admin = await createUser();
    adminId = admin.id;
    const ws = await createWorkspace(admin.id);
    workspaceId = ws.id;
    const project = await createProject(ws.id, admin.id);
    projectId = project.id;

    // Substitui os estados em inglês do factory pelo conjunto pt-BR do workflow.
    await prisma.state.deleteMany({where: {projectId}});
    for (const st of DEFAULT_STATES) {
      await prisma.state.create({
        data: {
          projectId,
          workspaceId,
          name: st.name,
          group: st.group,
          sequence: st.sequence,
          color: st.color,
          isTriage: st.group === "triage",
          slug: st.name.toLowerCase(),
        },
      });
    }

    const ti = await createUser();
    tiId = ti.id;
    await addMember(workspaceId, ti.id, 12, projectId, 12);
    const qualidade = await createUser();
    qualidadeId = qualidade.id;
    await addMember(workspaceId, qualidade.id, 8, projectId, 8);
    const guest = await createUser();
    guestId = guest.id;
    await addMember(workspaceId, guest.id, 5, projectId, 5);

    roleIds = await seedWorkflowRoles(prisma, workspaceId);
  });

  afterAll(() => cleanDb());

  describe("resolveRole", () => {
    it("prefere o workflowRoleId explícito", async () => {
      const r = await resolveRole(workspaceId, 5, roleIds.gestor_projeto);
      expect(r.key).toBe("gestor_projeto");
      expect(r.level).toBe(18);
    });

    it("cai para a busca por nível quando o id não existe", async () => {
      const r = await resolveRole(workspaceId, 12, "00000000-0000-0000-0000-000000000000");
      expect(r.key).toBe("ti");
      expect(r.id).toBe(roleIds.ti);
    });

    it("resolve pelo nível quando não há workflowRoleId", async () => {
      expect((await resolveRole(workspaceId, 8, null)).key).toBe("qualidade");
      expect((await resolveRole(workspaceId, 20, undefined)).key).toBe("admin");
    });

    it("usa os defaults em memória num workspace sem papéis semeados", async () => {
      const other = await createWorkspace((await createUser()).id);
      const r = await resolveRole(other.id, 15);
      expect(r.id).toBeNull();
      // DEFAULT_ROLES declara member(15) antes de ti(12); a busca precisa ser por
      // nível, não pela ordem da lista, senão um membro vira TI.
      expect(r.key).toBe("member");
      expect((await resolveRole(other.id, 12)).key).toBe("ti");
      expect((await resolveRole(other.id, 19)).key).toBe("gestor_projeto");
    });

    it("nível abaixo de qualquer papel cai no mais básico", async () => {
      const other = await createWorkspace((await createUser()).id);
      expect((await resolveRole(other.id, 0)).key).toBe("guest");
    });
  });

  describe("requireProjectAction", () => {
    it("libera quando o papel tem a ação", async () => {
      const {role} = await requireProjectAction(workspaceId, projectId, tiId, EProjectAction.ISSUE_CREATE);
      expect(role.key).toBe("ti");
    });

    it("403 quando o papel não tem a ação", async () => {
      const thrown = await catchThrown(() =>
        requireProjectAction(workspaceId, projectId, guestId, EProjectAction.ISSUE_CREATE),
      );
      expect(thrown).toMatchObject({status: 403});
    });

    it("403 para quem não é membro do projeto", async () => {
      const outsider = await createUser();
      const thrown = await catchThrown(() =>
        requireProjectAction(workspaceId, projectId, outsider.id, EProjectAction.ISSUE_VIEW),
      );
      expect(thrown).toMatchObject({status: 403});
    });
  });

  describe("requireOwnOrAll", () => {
    it("passa direto quando o papel tem a permissão ampla", async () => {
      const {role} = await requireOwnOrAll(
        workspaceId,
        projectId,
        adminId,
        "outro-usuario",
        EProjectAction.COMMENT_DELETE_OWN,
        EProjectAction.COMMENT_DELETE_ALL,
      );
      expect(role.key).toBe("admin");
    });

    it("passa quando o papel só tem a permissão própria E é o autor", async () => {
      const {role} = await requireOwnOrAll(
        workspaceId,
        projectId,
        tiId,
        tiId,
        EProjectAction.COMMENT_DELETE_OWN,
        EProjectAction.COMMENT_DELETE_ALL,
      );
      expect(role.key).toBe("ti");
    });

    it("403 quando só tem a permissão própria e o registro é de outro", async () => {
      const thrown = await catchThrown(() =>
        requireOwnOrAll(
          workspaceId,
          projectId,
          tiId,
          adminId,
          EProjectAction.COMMENT_DELETE_OWN,
          EProjectAction.COMMENT_DELETE_ALL,
        ),
      );
      expect(thrown).toMatchObject({status: 403});
    });

    it("403 quando o dono do registro é desconhecido", async () => {
      const thrown = await catchThrown(() =>
        requireOwnOrAll(
          workspaceId,
          projectId,
          tiId,
          null,
          EProjectAction.COMMENT_DELETE_OWN,
          EProjectAction.COMMENT_DELETE_ALL,
        ),
      );
      expect(thrown).toMatchObject({status: 403});
    });
  });

  
  describe("exceções por pessoa", () => {
    const setOverrides = (memberId: string, granted: string[], revoked: string[]) =>
      prisma.workspaceMember.updateMany({
        where: {workspaceId, memberId},
        data: {grantedActions: granted, revokedActions: revoked},
      });

    it("concessão à pessoa libera ação de sistema que a função não tem", async () => {
      await setOverrides(guestId, ["issue.priority"], []);
      const {role} = await requireProjectAction(workspaceId, projectId, guestId, EProjectAction.ISSUE_PRIORITY);
      expect(role.permissions).toContain("issue.priority");
      await setOverrides(guestId, [], []);
    });

    it("negação à pessoa barra o que a função daria", async () => {
      await setOverrides(tiId, [], ["cycle.manage"]);
      const thrown = await catchThrown(() =>
        requireProjectAction(workspaceId, projectId, tiId, EProjectAction.CYCLE_MANAGE),
      );
      expect(thrown).toMatchObject({status: 403});
      await setOverrides(tiId, [], []);
    });

    it("vale também para as ações do espaço de trabalho", async () => {
      await setOverrides(qualidadeId, ["report.view"], ["chat.atender"]);
      expect(await hasWorkspaceAction(workspaceId, qualidadeId, EProjectAction.REPORT_VIEW)).toBe(true);
      expect(await hasWorkspaceAction(workspaceId, qualidadeId, EProjectAction.CHAT_ATENDER)).toBe(false);
      await setOverrides(qualidadeId, [], []);
    });

    it("listMemberActions devolve função, efetivas e exceções", async () => {
      await setOverrides(guestId, ["issue.priority"], ["comment.read"]);
      const r = await listMemberActions(workspaceId, guestId);
      expect(r.role.key).toBe("guest");
      expect(r.permissions).toContain("issue.priority");
      expect(r.permissions).not.toContain("comment.read");
      expect(r.granted).toEqual(["issue.priority"]);
      expect(r.revoked).toEqual(["comment.read"]);
      await setOverrides(guestId, [], []);
    });
  });

  describe("requireWorkspaceAction", () => {
    it("403 para quem não tem a ação no espaço", async () => {
      const thrown = await catchThrown(() => requireWorkspaceAction(workspaceId, tiId, EProjectAction.WORKSPACE_SETTINGS));
      expect(thrown).toMatchObject({status: 403});
    });

    it("admin do espaço passa", async () => {
      const role = await requireWorkspaceAction(workspaceId, adminId, EProjectAction.WORKSPACE_SETTINGS);
      expect(role.key).toBe("admin");
    });

    it("hasWorkspaceAction responde falso para quem não é do espaço", async () => {
      const outsider = await createUser();
      expect(await hasWorkspaceAction(workspaceId, outsider.id, EProjectAction.ISSUE_VIEW)).toBe(false);
    });
  });

  describe("admin do espaço dentro do sistema", () => {
    it("não herda a função baixa gravada na associação ao sistema", async () => {
      await prisma.projectMember.updateMany({
        where: {projectId, memberId: adminId},
        data: {role: 5, workflowRoleId: roleIds.guest},
      });
      const {member} = await getProjectOrFail(workspaceId, projectId, adminId);
      const role = await resolveRole(workspaceId, member.role, (member as any).workflowRoleId);
      expect(role.key).toBe("admin");
      await prisma.projectMember.updateMany({
        where: {projectId, memberId: adminId},
        data: {role: 20, workflowRoleId: roleIds.admin},
      });
    });
  });

  describe("canTransition", () => {
    const s = (group: string, name: string) => ({group, name});

    it("papel irrestrito move para qualquer lugar", async () => {
      const admin = await resolveRole(workspaceId, 20);
      expect(await canTransition(admin, s("triage", "Triagem"), s("completed", "Concluído"))).toBe(true);
    });

    it("mover para o mesmo estado é sempre permitido", async () => {
      const guest = await resolveRole(workspaceId, 5);
      expect(await canTransition(guest, s("backlog", "Pendências"), s("backlog", "Pendências"))).toBe(true);
    });

    it("papel ainda não gravado no banco cai na matriz padrão, não em liberar tudo", async () => {
      // Antes isto devolvia `true` para qualquer movimento: um espaço de
      // trabalho sem as funções gravadas ficava SEM nenhuma restrição de etapa.
      const other = await createWorkspace((await createUser()).id);
      const naoSemeado = await resolveRole(other.id, 15);
      expect(await canTransition(naoSemeado, s("triage", "Triagem"), s("completed", "Concluído"))).toBe(false);
      expect(await canTransition(naoSemeado, s("triage", "Triagem"), s("unstarted", "A Fazer"))).toBe(true);
    });

    it("TI leva A Fazer → Em Desenvolvimento, mas não A Fazer → Concluído", async () => {
      const ti = await resolveRole(workspaceId, 12);
      expect(await canTransition(ti, s("unstarted", "A Fazer"), s("started", "Em Desenvolvimento"))).toBe(true);
      expect(await canTransition(ti, s("unstarted", "A Fazer"), s("completed", "Concluído"))).toBe(false);
    });

    it("Qualidade aprova o intake para A Fazer", async () => {
      const qualidade = await resolveRole(workspaceId, 8);
      expect(await canTransition(qualidade, s("triage", "Triagem"), s("unstarted", "A Fazer"))).toBe(true);
      expect(await canTransition(qualidade, s("triage", "Triagem"), s("started", "Em Desenvolvimento"))).toBe(false);
    });

    it("Visualizador não move nada", async () => {
      const guest = await resolveRole(workspaceId, 5);
      expect(await canTransition(guest, s("backlog", "Pendências"), s("unstarted", "A Fazer"))).toBe(false);
    });

    it("regra com toStateName null aceita qualquer estado do grupo destino", async () => {
      const ti = await resolveRole(workspaceId, 12);
      expect(await canTransition(ti, s("started", "Em Desenvolvimento"), s("cancelled", "Cancelado"))).toBe(true);
    });

    it("TI entrega em Em Teste e não fecha: concluir é da Qualidade", async () => {
      const ti = await resolveRole(workspaceId, 12);
      expect(await canTransition(ti, s("started", "Em Desenvolvimento"), s("started", "Em Teste"))).toBe(true);
      expect(await canTransition(ti, s("started", "Em Teste"), s("completed", "Concluído"))).toBe(false);
      expect(await canTransition(ti, s("started", "Em Desenvolvimento"), s("triage", "Triagem"))).toBe(false);
      expect(await canTransition(ti, s("started", "Em Desenvolvimento"), s("started", "Em Análise"))).toBe(false);
    });

    it("usa os ids de papel semeados (sanidade do fixture)", () => {
      expect(Object.keys(roleIds)).toHaveLength(7);
      expect(qualidadeId).toBeDefined();
    });
  });
});
