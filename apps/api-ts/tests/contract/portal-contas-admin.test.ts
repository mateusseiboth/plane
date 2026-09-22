/**
 * A tela de contas do portal em Configurações: criar, editar, vincular à
 * entidade, desativar e redefinir a senha, tudo pela ação `portal.manage`.
 *
 * O servidor sob teste precisa subir com EMAIL_TRANSPORT=fake, SMTP_* e o mesmo
 * EMAIL_OUTBOX_DIR deste processo: é ali que o link de nova senha aparece.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createEntity,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import { clearFakeOutbox, readFakeOutbox } from "@utils/email-transport";

const SENHA = "portal-secreto-123";
const prisma = () => prismaReal();

// Endereço próprio deste arquivo: o limite de login do portal é por IP e fica na
// memória do servidor, então a suíte inteira dividiria as mesmas 10 tentativas.
const IP_DO_TESTE = "10.10.0.1";

const entrar = (workspace: string, email: string, senha: string) =>
  fetch(`${TEST_API_BASE_URL}/portal/api/entrar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": IP_DO_TESTE },
    body: JSON.stringify({ workspace, email, senha }),
  });

describe("Contas do portal em Configurações", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoId: string;
  let entidadeId: string;
  let entidadeDeOutroEspacoId: string;
  let contaId: string;

  const contas = (resto = "") => `/workspaces/${wsSlug}/portal-accounts/${resto}`;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    admin = apiClient((await createApiToken(user.id)).token);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    projetoId = (await createProject(ws.id, user.id, { name: "SIART", identifier: "SIART" })).id;
    entidadeId = (await createEntity(ws.id, { name: "Prefeitura de Exemplo" })).id;
    const outroEspaco = await createWorkspace(user.id);
    entidadeDeOutroEspacoId = (await createEntity(outroEspaco.id, { name: "De outro espaço" })).id;
  });

  afterAll(() => cleanDb());

  it("criar com dados inválidos devolve cada erro no seu campo", async () => {
    const res = await admin.post(contas(), { name: "", email: "sem-arroba", password: "123" });
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as any;
    expect(corpo.errors.map((e: any) => e.path).toSorted()).toEqual(["email", "name", "password"]);
  });

  it("entidade de outro espaço é recusada no campo", async () => {
    const res = await admin.post(contas(), {
      name: "Prefeitura",
      email: "contato@prefeitura.test",
      password: SENHA,
      entity_id: entidadeDeOutroEspacoId,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([{ path: "entity_id", message: expect.any(String) }]);
  });

  it("sistema de outro espaço é recusado no campo", async () => {
    const res = await admin.post(contas(), {
      name: "Prefeitura",
      email: "contato@prefeitura.test",
      password: SENHA,
      project_ids: ["0192f4b8-0000-7000-8000-000000000999"],
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("project_ids");
  });

  it("cria vinculada à entidade e devolve o nome dela na lista", async () => {
    const res = await admin.post(contas(), {
      name: "Prefeitura",
      email: "Contato@Prefeitura.test",
      password: SENHA,
      entity_id: entidadeId,
      project_ids: [projetoId],
    });
    expect(res.status).toBe(201);
    contaId = ((await res.json()) as any).id;

    const lista = ((await (await admin.get(contas())).json()) as any).results;
    expect(lista[0]).toMatchObject({
      id: contaId,
      email: "contato@prefeitura.test",
      entity_id: entidadeId,
      entity: { id: entidadeId, name: "Prefeitura de Exemplo" },
      project_ids: [projetoId],
      is_active: true,
    });
  });

  it("e-mail repetido volta no campo", async () => {
    const res = await admin.post(contas(), { name: "Outra", email: "contato@prefeitura.test", password: SENHA });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).errors).toEqual([{ path: "email", message: expect.any(String) }]);
  });

  it("edita o nome e desvincula a entidade", async () => {
    const res = await admin.patch(contas(contaId), { name: "Prefeitura Municipal", entity_id: null });
    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ name: "Prefeitura Municipal", entity_id: null, entity: null });
  });

  it("desativa e reativa", async () => {
    expect((await (await admin.patch(contas(contaId), { is_active: false })).json()) as any).toMatchObject({
      is_active: false,
    });
    expect((await entrar(wsSlug, "contato@prefeitura.test", SENHA)).status).toBe(403);
    await admin.patch(contas(contaId), { is_active: true });
    expect((await entrar(wsSlug, "contato@prefeitura.test", SENHA)).status).toBe(200);
  });

  describe("redefinir senha", () => {
    it("com e-mail configurado, manda o link para a conta", async () => {
      await clearFakeOutbox();
      const res = await admin.post(contas(`${contaId}/reset-password/`), {});
      expect(res.status).toBe(200);
      expect((await res.json()) as any).toMatchObject({ mode: "email" });
      const email = (await readFakeOutbox()).findLast((m) => m.to === "contato@prefeitura.test");
      expect(email?.text).toContain("/portal/?");
    });

    it("a senha provisória troca a senha e derruba a sessão aberta", async () => {
      const antes = (await (await entrar(wsSlug, "contato@prefeitura.test", SENHA)).json()) as any;
      const res = await admin.post(contas(`${contaId}/reset-password/`), { modo: "provisoria" });
      expect(res.status).toBe(200);
      const dados = (await res.json()) as any;
      expect(dados.mode).toBe("provisoria");
      expect(dados.password).toHaveLength(12);

      expect((await entrar(wsSlug, "contato@prefeitura.test", SENHA)).status).toBe(403);
      expect((await entrar(wsSlug, "contato@prefeitura.test", dados.password)).status).toBe(200);
      const sessaoVelha = await fetch(`${TEST_API_BASE_URL}/portal/api/eu`, {
        headers: { Authorization: `Bearer ${antes.token}` },
      });
      expect(sessaoVelha.status).toBe(401);
    });

    it("conta de outro espaço responde 404", async () => {
      const res = await admin.post(
        `/workspaces/${wsSlug}/portal-accounts/0192f4b8-0000-7000-8000-000000000999/reset-password/`,
        {}
      );
      expect(res.status).toBe(404);
    });
  });

  describe("permissão", () => {
    it("membro sem portal.manage não lista nem redefine", async () => {
      const membro = await createMemberWithToken(wsId, 15);
      const cliente = apiClient(membro.token);
      expect((await cliente.get(contas())).status).toBe(403);
      expect((await cliente.post(contas(`${contaId}/reset-password/`), {})).status).toBe(403);
    });

    it("concessão por pessoa de portal.manage libera a tela", async () => {
      const membro = await createMemberWithToken(wsId, 15);
      await prisma().workspaceMember.updateMany({
        where: { workspaceId: wsId, memberId: membro.user.id },
        data: { grantedActions: ["portal.manage"] },
      });
      expect((await apiClient(membro.token).get(contas())).status).toBe(200);
    });
  });
});
