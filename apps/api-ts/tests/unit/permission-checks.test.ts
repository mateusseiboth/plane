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
  requireOwnOrAll,
  requireProjectAction,
  resolveRole,
} from "@utils/permission-checks";
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

    it("papel não semeado é permissivo (comportamento legado)", async () => {
      const other = await createWorkspace((await createUser()).id);
      const unseeded = await resolveRole(other.id, 15);
      expect(await canTransition(unseeded, s("triage", "Triagem"), s("completed", "Concluído"))).toBe(true);
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
      expect(await canTransition(ti, s("started", "Em Teste"), s("completed", "Concluído"))).toBe(true);
    });

    it("usa os ids de papel semeados (sanidade do fixture)", () => {
      expect(Object.keys(roleIds)).toHaveLength(7);
      expect(qualidadeId).toBeDefined();
    });
  });
});
