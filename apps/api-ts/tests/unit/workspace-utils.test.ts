/**
 * Guards de workspace/projeto — toda rota escopada passa por aqui, então os
 * status lançados (404 vs 403) são o contrato de erro de praticamente toda a API.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {addMember, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {
  getProjectOrFail,
  getWorkspaceOrFail,
  isWorkspaceMember,
  requireWorkspaceMember,
  requireWorkspaceWriter,
} from "@utils/workspace";

const catchThrown = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e as {status: number; message: string};
  }
};

describe("guards de workspace", () => {
  let ws: {id: string; slug: string};
  let adminId: string;
  let memberId: string;
  let guestId: string;
  let outsiderId: string;
  let projectId: string;
  let otherProjectId: string;

  beforeAll(async () => {
    await cleanDb();
    const admin = await createUser();
    adminId = admin.id;
    const w = await createWorkspace(admin.id);
    ws = {id: w.id, slug: w.slug};
    const project = await createProject(w.id, admin.id);
    projectId = project.id;

    const member = await createUser();
    memberId = member.id;
    await addMember(w.id, member.id, 15, projectId, 15);
    // Projeto criado por outro usuário: o admin do workspace NÃO tem linha em
    // project_members nele, que é o cenário do acesso sintético.
    otherProjectId = (await createProject(w.id, member.id)).id;

    const guest = await createUser();
    guestId = guest.id;
    await addMember(w.id, guest.id, 5);

    outsiderId = (await createUser()).id;
  });

  afterAll(() => cleanDb());

  describe("getWorkspaceOrFail", () => {
    it("resolve pelo slug", async () => {
      expect((await getWorkspaceOrFail(ws.slug)).id).toBe(ws.id);
    });

    it("lança 404 para slug inexistente", async () => {
      expect(await catchThrown(() => getWorkspaceOrFail("nao-existe"))).toMatchObject({status: 404});
    });
  });

  describe("isWorkspaceMember", () => {
    it("true para membro ativo, false para quem está de fora", async () => {
      expect(await isWorkspaceMember(ws.id, memberId)).toBe(true);
      expect(await isWorkspaceMember(ws.id, outsiderId)).toBe(false);
    });

    it("false quando a associação está inativa", async () => {
      const inactive = await createUser();
      await prisma.workspaceMember.create({
        data: {workspaceId: ws.id, memberId: inactive.id, role: 15, isActive: false},
      });
      expect(await isWorkspaceMember(ws.id, inactive.id)).toBe(false);
    });
  });

  describe("requireWorkspaceMember / requireWorkspaceWriter", () => {
    it("devolve a associação do membro", async () => {
      expect((await requireWorkspaceMember(ws.id, memberId)).role).toBe(15);
    });

    it("lança 403 para quem não é membro", async () => {
      expect(await catchThrown(() => requireWorkspaceMember(ws.id, outsiderId))).toMatchObject({status: 403});
    });

    it("writer exige papel >= 15", async () => {
      expect((await requireWorkspaceWriter(ws.id, memberId)).role).toBe(15);
      expect(await catchThrown(() => requireWorkspaceWriter(ws.id, guestId))).toMatchObject({status: 403});
    });
  });

  describe("getProjectOrFail", () => {
    it("devolve projeto e associação do membro do projeto", async () => {
      const {project, member} = await getProjectOrFail(ws.id, projectId, memberId);
      expect(project.id).toBe(projectId);
      expect(member.role).toBe(15);
    });

    it("lança 404 quando o projeto não existe no workspace", async () => {
      const other = await createWorkspace((await createUser()).id);
      expect(await catchThrown(() => getProjectOrFail(other.id, projectId, adminId))).toMatchObject({status: 404});
    });

    it("lança 403 para membro do workspace sem acesso ao projeto", async () => {
      expect(await catchThrown(() => getProjectOrFail(ws.id, projectId, guestId))).toMatchObject({status: 403});
    });

    it("admin do workspace acessa projeto do qual não é membro, com papel 20", async () => {
      const {member} = await getProjectOrFail(ws.id, otherProjectId, adminId);
      expect(member.role).toBe(20);
      expect(member.id).toBe(`ws-admin-${adminId}`);
    });

    it("eleva a associação de projeto do admin para 20 mesmo se gravada em nível menor", async () => {
      const downgraded = await createUser();
      await addMember(ws.id, downgraded.id, 20, projectId, 15);
      const {member} = await getProjectOrFail(ws.id, projectId, downgraded.id);
      expect(member.role).toBe(20);
    });

    it("allowInstanceAdmin libera admin de instância sem associação", async () => {
      const instanceAdmin = await prisma.user.create({
        data: {
          email: `ia-${Date.now()}@plane.test`,
          username: `ia_${Date.now()}`,
          displayName: "InstanceAdmin",
          isActive: true,
          isInstanceAdmin: true,
        },
      });
      const {member} = await getProjectOrFail(ws.id, projectId, instanceAdmin.id, {allowInstanceAdmin: true});
      expect(member.role).toBe(20);
      expect(member.id).toBe(`instance-admin-${instanceAdmin.id}`);

      // sem a flag, o mesmo usuário continua sendo barrado
      expect(await catchThrown(() => getProjectOrFail(ws.id, projectId, instanceAdmin.id))).toMatchObject({
        status: 403,
      });
    });

    it("allowInstanceAdmin não libera usuário comum", async () => {
      const thrown = await catchThrown(() =>
        getProjectOrFail(ws.id, projectId, outsiderId, {allowInstanceAdmin: true}),
      );
      expect(thrown).toMatchObject({status: 403});
    });
  });
});
