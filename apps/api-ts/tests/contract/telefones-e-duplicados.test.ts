/**
 * Aviso de telefone ou e-mail repetido ao cadastrar responsável, e a agenda
 * "Telefones" (usuários ativos de A a Z, com apelido, telefone e celular).
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  addMember,
  apiClient,
  createApiToken,
  createEntity,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const prisma = () => prismaReal();

describe("responsável com telefone ou e-mail repetido", () => {
  let client: ReturnType<typeof apiClient>;
  let slug: string;
  let existenteId: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    client = apiClient((await createApiToken(user.id)).token);
    const entidade = await createEntity(ws.id, { name: "Prefeitura de Ladário" });
    const res = await client.post(`/workspaces/${slug}/entity-contacts/`, {
      name: "Maria Existente",
      email: "maria@ladario.ms.gov.br",
      phone: "(67) 99999-0000",
      entity_id: entidade.id,
    });
    existenteId = ((await res.json()) as any).id;
  });

  const url = (query: string) => `/workspaces/${slug}/entity-contacts/duplicates/?${query}`;

  it("acha pelo telefone, em qualquer formato", async () => {
    const res = await client.get(url("phone=5567999990000"));
    expect(res.status).toBe(200);
    expect((await res.json()) as any[]).toEqual([
      { id: existenteId, name: "Maria Existente", entity_name: "Prefeitura de Ladário", matches: ["phone"] },
    ]);
  });

  it("acha pelo e-mail sem diferenciar maiúsculas, e junta os dois motivos", async () => {
    const achados = (await (await client.get(url("email=MARIA@ladario.ms.gov.br&phone=67999990000"))).json()) as any[];
    expect(achados).toEqual([expect.objectContaining({ id: existenteId, matches: ["phone", "email"] })]);
  });

  it("na edição, o próprio contato não conta", async () => {
    const achados = (await (await client.get(url(`phone=67999990000&exclude_id=${existenteId}`))).json()) as any[];
    expect(achados).toEqual([]);
  });

  it("sem telefone nem e-mail, lista vazia", async () => {
    expect(await (await client.get(url(""))).json()).toEqual([]);
  });
});

describe("agenda de telefones", () => {
  let client: ReturnType<typeof apiClient>;
  let slug: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser({ displayName: "Beatriz", firstName: "Beatriz" });
    const ws = await createWorkspace(user.id);
    slug = ws.slug;
    client = apiClient((await createApiToken(user.id)).token);
    await prisma().user.update({
      where: { id: user.id },
      data: { nickname: "Bia", phone: "(67) 3321-0000", mobilePhone: "(67) 99999-1111" },
    });
    const ana = await createUser({ displayName: "Ana", firstName: "Ana" });
    await addMember(ws.id, ana.id, 15);
    const congelado = await createUser({ displayName: "Carlos", firstName: "Carlos" });
    await addMember(ws.id, congelado.id, 15);
    await prisma().workspaceMember.updateMany({
      where: { workspaceId: ws.id, memberId: congelado.id },
      data: { isActive: false, frozenAt: new Date() },
    });
    const inativo = await createUser({ displayName: "Daniel", firstName: "Daniel" });
    await addMember(ws.id, inativo.id, 15);
    await prisma().user.update({ where: { id: inativo.id }, data: { isActive: false } });
  });

  it("lista os usuários ativos do espaço de A a Z, com apelido, telefone e celular", async () => {
    const res = await client.get(`/workspaces/${slug}/phone-book/`);
    expect(res.status).toBe(200);
    const agenda = (await res.json()) as any[];
    expect(agenda.map((p) => p.display_name)).toEqual(["Ana", "Beatriz"]);
    expect(agenda[1]).toMatchObject({ nickname: "Bia", phone: "(67) 3321-0000", mobile_phone: "(67) 99999-1111" });
  });

  it("quem não é do espaço não vê", async () => {
    const estranho = await createUser();
    const fora = apiClient((await createApiToken(estranho.id)).token);
    expect((await fora.get(`/workspaces/${slug}/phone-book/`)).status).toBe(403);
  });
});
