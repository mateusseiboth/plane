/**
 * Cadastro completo da entidade (endereço, representante, entidade responsável
 * pelo CNPJ), congelamento da entidade e vínculo do contato com os sistemas.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  addMember,
  apiClient,
  createApiToken,
  createEntity,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const prisma = () => prismaReal();

describe("cadastro completo da entidade", () => {
  let client: ReturnType<typeof apiClient>;
  let slug: string;
  let workspaceId: string;
  let representanteId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    workspaceId = ws.id;
    client = apiClient((await createApiToken(user.id)).token);
    const rep = await createUser({ displayName: "Representante" });
    await addMember(ws.id, rep.id, 15);
    representanteId = rep.id;
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${slug}/entities/`;

  it("grava endereço, dados cadastrais e representante", async () => {
    const res = await client.post(url(), {
      name: "Prefeitura de Terenos",
      cnpj: "03.501.525/0001-17",
      street: "Rua Principal",
      address_number: "100",
      complement: "Sala 2",
      district: "Centro",
      zip_code: "79190-000",
      city: "Terenos",
      state: "MS",
      fax: "(67) 3246-0000",
      state_registration: "ISENTO",
      website: "https://terenos.ms.gov.br",
      representative_id: representanteId,
    });
    expect(res.status).toBe(201);
    const e = (await res.json()) as any;
    expect(e).toMatchObject({
      street: "Rua Principal",
      address_number: "100",
      complement: "Sala 2",
      district: "Centro",
      zip_code: "79190000",
      fax: "(67) 3246-0000",
      state_registration: "ISENTO",
      website: "https://terenos.ms.gov.br",
      representative_id: representanteId,
      representative_name: "Representante",
      is_frozen: false,
    });
  });

  it("CEP com tamanho errado volta para o campo", async () => {
    const res = await client.post(url(), { name: "CEP ruim", zip_code: "7919" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([{ path: "zip_code", message: expect.any(String) }]);
  });

  it("representante precisa ser membro do espaço", async () => {
    const estranho = await createUser();
    const res = await client.post(url(), { name: "Rep estranho", representative_id: estranho.id });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("representative_id");
  });

  it("CNPJ de terceiro usa o CNPJ da entidade responsável", async () => {
    const mae = await createEntity(workspaceId, { name: "Fundo Municipal", cnpj: "11.111.111/0001-11" });
    const res = await client.post(url(), {
      name: "Secretaria de Saúde",
      related_entity_id: mae.id,
      uses_third_party_cnpj: true,
    });
    expect(res.status).toBe(201);
    const e = (await res.json()) as any;
    expect(e).toMatchObject({
      related_entity_id: mae.id,
      related_entity_name: "Fundo Municipal",
      uses_third_party_cnpj: true,
      effective_cnpj: "11.111.111/0001-11",
    });
  });

  it("CNPJ de terceiro sem entidade responsável volta para o campo", async () => {
    const res = await client.post(url(), { name: "Sem mãe", uses_third_party_cnpj: true });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("related_entity_id");
  });

  it("entidade não pode ser responsável por ela mesma", async () => {
    const e = (await (await client.post(url(), { name: "Ela mesma" })).json()) as any;
    const res = await client.patch(`${url()}${e.id}/`, { related_entity_id: e.id });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("related_entity_id");
  });

  it("entidade responsável de outro espaço é recusada", async () => {
    const outroDono = await createUser();
    const outroWs = await createWorkspace(outroDono.id);
    const alheia = await createEntity(outroWs.id);
    const res = await client.post(url(), { name: "Com mãe alheia", related_entity_id: alheia.id });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("related_entity_id");
  });
});

describe("congelamento da entidade", () => {
  let admin: ReturnType<typeof apiClient>;
  let escritor: ReturnType<typeof apiClient>;
  let slug: string;
  let workspaceId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    workspaceId = ws.id;
    admin = apiClient((await createApiToken(user.id)).token);
    const outro = await createUser();
    await addMember(ws.id, outro.id, 15);
    escritor = apiClient((await createApiToken(outro.id)).token);
  });

  afterAll(() => cleanDb());

  async function seedEntidadeWithDependentes() {
    const entidade = await createEntity(workspaceId);
    const ativo = await prisma().entityContact.create({
      data: { workspaceId, entityId: entidade.id, name: "Ativo", isActive: true },
    });
    const jaInativo = await prisma().entityContact.create({
      data: { workspaceId, entityId: entidade.id, name: "Já inativo", isActive: false },
    });
    const conta = await prisma().portalAccount.create({
      data: {
        workspaceId,
        entityId: entidade.id,
        email: `portal-${entidade.id.slice(0, 6)}@cliente.test`,
        name: "Cliente",
        password: "x",
      },
    });
    return { entidade, ativo, jaInativo, conta };
  }

  it("só administrador congela", async () => {
    const { entidade } = await seedEntidadeWithDependentes();
    const res = await escritor.post(`/workspaces/${slug}/entities/${entidade.id}/freeze/`, { reason: "x" });
    expect(res.status).toBe(403);
  });

  it("exige motivo", async () => {
    const { entidade } = await seedEntidadeWithDependentes();
    const res = await admin.post(`/workspaces/${slug}/entities/${entidade.id}/freeze/`, {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("reason");
  });

  it("congelar desliga contatos e contas do portal; descongelar religa só o que foi desligado", async () => {
    const { entidade, ativo, jaInativo, conta } = await seedEntidadeWithDependentes();
    const base = `/workspaces/${slug}/entities/${entidade.id}`;

    const res = await admin.post(`${base}/freeze/`, { reason: "Contrato encerrado" });
    expect(res.status).toBe(200);
    expect((await res.json()) as any).toMatchObject({ is_frozen: true, frozen_reason: "Contrato encerrado" });
    expect((await prisma().entityContact.findUnique({ where: { id: ativo.id } }))?.isActive).toBe(false);
    expect((await prisma().portalAccount.findUnique({ where: { id: conta.id } }))?.isActive).toBe(false);

    expect((await admin.post(`${base}/freeze/`, { reason: "de novo" })).status).toBe(409);

    const volta = await admin.post(`${base}/unfreeze/`, { reason: "Renovou" });
    expect(volta.status).toBe(200);
    expect((await volta.json()) as any).toMatchObject({ is_frozen: false, frozen_reason: null });
    expect((await prisma().entityContact.findUnique({ where: { id: ativo.id } }))?.isActive).toBe(true);
    expect((await prisma().entityContact.findUnique({ where: { id: jaInativo.id } }))?.isActive).toBe(false);
    expect((await prisma().portalAccount.findUnique({ where: { id: conta.id } }))?.isActive).toBe(true);

    const historico = (await (await admin.get(`${base}/freeze-events/`)).json()) as any[];
    expect(historico.map((e) => [e.action, e.reason])).toEqual([
      ["unfreeze", "Renovou"],
      ["freeze", "Contrato encerrado"],
    ]);
    expect(historico[1].actor_id).toBeTruthy();
  });

  it("descongelar o que não está congelado responde 409", async () => {
    const { entidade } = await seedEntidadeWithDependentes();
    const res = await admin.post(`/workspaces/${slug}/entities/${entidade.id}/unfreeze/`, {});
    expect(res.status).toBe(409);
  });

  it("filtra a lista por congeladas", async () => {
    const { entidade } = await seedEntidadeWithDependentes();
    await admin.post(`/workspaces/${slug}/entities/${entidade.id}/freeze/`, { reason: "Inadimplente" });
    const lista = (await (await admin.get(`/workspaces/${slug}/entities/?is_frozen=true`)).json()) as any;
    expect(lista.results.map((e: any) => e.id)).toEqual([entidade.id]);
    const livres = (await (await admin.get(`/workspaces/${slug}/entities/?is_frozen=false`)).json()) as any;
    expect(livres.results.some((e: any) => e.id === entidade.id)).toBe(false);
  });
});

describe("contato por sistema", () => {
  let client: ReturnType<typeof apiClient>;
  let slug: string;
  let projetoA: string;
  let projetoB: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    client = apiClient((await createApiToken(user.id)).token);
    projetoA = (await createProject(ws.id, user.id, { name: "Folha" })).id;
    projetoB = (await createProject(ws.id, user.id, { name: "Tributos" })).id;
  });

  afterAll(() => cleanDb());

  const url = () => `/workspaces/${slug}/entity-contacts/`;

  it("grava os sistemas do contato e devolve id e nome", async () => {
    const res = await client.post(url(), { name: "Maria", project_ids: [projetoA, projetoB] });
    expect(res.status).toBe(201);
    const c = (await res.json()) as any;
    expect(c.project_ids.toSorted()).toEqual([projetoA, projetoB].toSorted());
    expect(c.projects.map((p: any) => p.name).toSorted()).toEqual(["Folha", "Tributos"]);
  });

  it("PATCH troca a lista inteira; sem o campo, mantém", async () => {
    const c = (await (await client.post(url(), { name: "João", project_ids: [projetoA] })).json()) as any;
    const trocado = (await (await client.patch(`${url()}${c.id}/`, { project_ids: [projetoB] })).json()) as any;
    expect(trocado.project_ids).toEqual([projetoB]);
    const mantido = (await (await client.patch(`${url()}${c.id}/`, { name: "João Silva" })).json()) as any;
    expect(mantido.project_ids).toEqual([projetoB]);
  });

  it("filtra a lista pelo sistema", async () => {
    await client.post(url(), { name: "Só Folha", project_ids: [projetoA] });
    const lista = (await (await client.get(`${url()}?project_id=${projetoA}`)).json()) as any[];
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((c) => c.project_ids.includes(projetoA))).toBe(true);
  });

  it("sistema de outro espaço volta para o campo", async () => {
    const outro = await createUser();
    const outroWs = await createWorkspace(outro.id);
    const alheio = await createProject(outroWs.id, outro.id);
    const res = await client.post(url(), { name: "Alheio", project_ids: [alheio.id] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("project_ids");
  });
});
