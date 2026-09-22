/**
 * Congelamento de pessoa em dois níveis:
 *  - no espaço (ação `workspace.members`): desliga só o vínculo com aquele espaço;
 *  - da conta (admin da instância): bloqueia o login e derruba as sessões.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import { addMember, apiClient, createApiToken, createUser, createWorkspace } from "@tests/helpers/factory";
import { requestSignIn, setPassword, signIn, withBearer } from "@tests/helpers/session";

const prisma = () => prismaReal();
const url = (id: string, acao: string) => `/instances/users/${id}/${acao}/`;

describe("congelamento no espaço", () => {
  let admin: ReturnType<typeof apiClient>;
  let slug: string;
  let workspaceId: string;
  let adminId: string;
  let alvo: { id: string; email: string };
  let outroSlug: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    adminId = user.id;
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    workspaceId = ws.id;
    admin = apiClient((await createApiToken(user.id)).token);
    alvo = await createUser();
    await addMember(ws.id, alvo.id, 15);
    await setPassword(alvo.id);
    // O alvo também participa de outro espaço, que o congelamento daqui não pode afetar.
    const outroDono = await createUser();
    const outro = await createWorkspace(outroDono.id);
    outroSlug = outro.slug;
    await addMember(outro.id, alvo.id, 15);
  });

  const freezeUrl = (id: string) => `/workspaces/${slug}/members/${id}/freeze/`;

  it("exige motivo", async () => {
    const res = await admin.post(freezeUrl(alvo.id), { reason: " " });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("reason");
  });

  it("não deixa congelar a si mesmo", async () => {
    expect((await admin.post(freezeUrl(adminId), { reason: "teste" })).status).toBe(400);
  });

  it("sem a ação de gerenciar membros não congela; com a concessão por pessoa, congela", async () => {
    const gestor = await createUser();
    await addMember(workspaceId, gestor.id, 15);
    const cliente = apiClient((await createApiToken(gestor.id)).token);
    const vitima = await createUser();
    await addMember(workspaceId, vitima.id, 15);

    expect((await cliente.post(freezeUrl(vitima.id), { reason: "x" })).status).toBe(403);
    await prisma().workspaceMember.updateMany({
      where: { workspaceId, memberId: gestor.id },
      data: { grantedActions: ["workspace.members"] },
    });
    expect((await cliente.post(freezeUrl(vitima.id), { reason: "x" })).status).toBe(200);
  });

  it("tira o acesso só a este espaço: a conta continua entrando e o outro espaço segue liberado", async () => {
    const sessao = await signIn(alvo.email);
    const res = await admin.post(freezeUrl(alvo.id), { reason: "Saiu do setor" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).frozen_reason).toBe("Saiu do setor");

    expect((await withBearer(sessao, `/api/v1/workspaces/${slug}/members/`)).status).toBe(403);
    expect((await withBearer(sessao, `/api/v1/workspaces/${outroSlug}/members/`)).status).toBe(200);
    expect((await withBearer(sessao, "/api/v1/users/me/")).status).toBe(200);
    await signIn(alvo.email);

    expect((await admin.post(freezeUrl(alvo.id), { reason: "de novo" })).status).toBe(409);
    const volta = await admin.post(`/workspaces/${slug}/members/${alvo.id}/unfreeze/`, { reason: "Voltou" });
    expect(volta.status).toBe(200);
    expect((await withBearer(sessao, `/api/v1/workspaces/${slug}/members/`)).status).toBe(200);

    const historico = (await (
      await admin.get(`/workspaces/${slug}/members/${alvo.id}/freeze-events/`)
    ).json()) as any[];
    expect(historico.map((e) => [e.action, e.reason])).toEqual([
      ["unfreeze", "Voltou"],
      ["freeze", "Saiu do setor"],
    ]);
  });

  it("congelado sai da lista de membros e aparece na lista de congelados do espaço", async () => {
    await admin.post(freezeUrl(alvo.id), { reason: "Férias longas" });
    const membros = (await (await admin.get(`/workspaces/${slug}/members/`)).json()) as any[];
    expect(membros.some((m) => m.member.id === alvo.id)).toBe(false);

    const congelados = async () =>
      ((await (await admin.get(`/workspaces/${slug}/frozen-members/`)).json()) as any[]).filter(
        (m) => m.id === alvo.id
      );
    expect(await congelados()).toEqual([
      expect.objectContaining({ id: alvo.id, email: alvo.email, is_frozen: true, frozen_reason: "Férias longas" }),
    ]);
    await admin.post(`/workspaces/${slug}/members/${alvo.id}/unfreeze/`, {});
    expect(await congelados()).toEqual([]);
  });
});

describe("congelamento da conta (admin da instância)", () => {
  let wsAdmin: ReturnType<typeof apiClient>;
  let instanceAdmin: ReturnType<typeof apiClient>;
  let alvo: { id: string; email: string };

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    wsAdmin = apiClient((await createApiToken(dono.id)).token);
    const root = await createUser();
    await prisma().user.update({ where: { id: root.id }, data: { isInstanceAdmin: true } });
    instanceAdmin = apiClient((await createApiToken(root.id)).token);
    alvo = await createUser();
    await addMember(ws.id, alvo.id, 15);
    await setPassword(alvo.id);
  });

  it("admin de espaço não congela a conta inteira", async () => {
    expect((await wsAdmin.post(url(alvo.id, "freeze"), { reason: "x" })).status).toBe(403);
  });

  it("exige motivo", async () => {
    const res = await instanceAdmin.post(url(alvo.id, "freeze"), {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("reason");
  });

  it("admin da instância congela: derruba as sessões e impede o login; descongelar devolve", async () => {
    const sessao = await signIn(alvo.email);
    const res = await instanceAdmin.post(url(alvo.id, "freeze"), { reason: "Desligado" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).is_frozen).toBe(true);

    expect((await withBearer(sessao, "/api/v1/users/me/")).status).toBe(401);
    expect((await requestSignIn(alvo.email)).status).toBe(403);

    expect((await instanceAdmin.post(url(alvo.id, "unfreeze"), {})).status).toBe(200);
    await signIn(alvo.email);
    const historico = (await (await instanceAdmin.get(url(alvo.id, "freeze-events"))).json()) as any[];
    expect(historico.map((e) => e.action)).toEqual(["unfreeze", "freeze"]);
  });
});
