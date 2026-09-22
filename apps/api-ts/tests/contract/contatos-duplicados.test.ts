/**
 * Aviso de telefone ou e-mail repetido ao cadastrar responsável. A agenda
 * "Telefones" saiu do produto (o cadastro de Contatos ocupa o lugar dela); o
 * último teste guarda a rota removida.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createEntity, createUser, createWorkspace } from "@tests/helpers/factory";

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

describe("agenda de telefones removida", () => {
  it("a rota da agenda não existe mais", async () => {
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    const client = apiClient((await createApiToken(user.id)).token);
    expect((await client.get(`/workspaces/${ws.slug}/phone-book/`)).status).toBe(404);
  });
});
