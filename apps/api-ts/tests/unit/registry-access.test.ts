/**
 * Quem pode publicar extensões (plugins/widgets): admin de instância, superuser
 * ou qualquer usuário com o papel TI (role 12) em algum workspace ativo.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {addMember, createUser, createWorkspace} from "@tests/helpers/factory";
import {isUploader, requireUploader} from "@utils/registry-access";

describe("registry-access", () => {
  let workspaceId: string;
  let tiId: string;
  let memberId: string;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    workspaceId = ws.id;

    const ti = await createUser();
    tiId = ti.id;
    await addMember(workspaceId, ti.id, 12);

    const member = await createUser();
    memberId = member.id;
    await addMember(workspaceId, member.id, 15);
  });

  afterAll(() => cleanDb());

  const asUser = (id: string, flags: Partial<{isInstanceAdmin: boolean; isSuperuser: boolean}> = {}) => ({
    id,
    isInstanceAdmin: flags.isInstanceAdmin ?? false,
    isSuperuser: flags.isSuperuser ?? false,
  });

  describe("isUploader", () => {
    it("libera admin de instância e superuser sem consultar o banco", async () => {
      expect(await isUploader(asUser("qualquer", {isInstanceAdmin: true}))).toBe(true);
      expect(await isUploader(asUser("qualquer", {isSuperuser: true}))).toBe(true);
    });

    it("libera quem tem papel TI em algum workspace", async () => {
      expect(await isUploader(asUser(tiId))).toBe(true);
    });

    it("nega membro comum e usuário sem workspace", async () => {
      expect(await isUploader(asUser(memberId))).toBe(false);
      expect(await isUploader(asUser((await createUser()).id))).toBe(false);
    });

    it("nega quando a associação TI está inativa", async () => {
      const inativo = await createUser();
      await prisma.workspaceMember.create({
        data: {workspaceId, memberId: inativo.id, role: 12, isActive: false},
      });
      expect(await isUploader(asUser(inativo.id))).toBe(false);
    });

    it("nega (sem lançar) quando o id não é um UUID válido", async () => {
      expect(await isUploader(asUser("não-é-uuid"))).toBe(false);
    });
  });

  describe("requireUploader", () => {
    it("não lança para quem pode publicar", async () => {
      const set: {status?: number | string} = {};
      await requireUploader(asUser(tiId), set);
      expect(set.status).toBeUndefined();
    });

    it("lança 403 e marca o status na resposta", async () => {
      const set: {status?: number | string} = {};
      let thrown: any = null;
      try {
        await requireUploader(asUser(memberId), set);
      } catch (e) {
        thrown = e;
      }
      expect(set.status).toBe(403);
      expect(thrown?.status).toBe(403);
    });
  });
});
