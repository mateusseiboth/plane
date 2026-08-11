/**
 * Testes de contrato dos Responsáveis (contatos das entidades) —
 * ver .claude/CONTRATO_RESPONSAVEIS.md.
 */
import {describe, it, expect, beforeAll, afterAll} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {
  createApiToken,
  createEntity,
  createMemberWithToken,
  createUser,
  createWorkspace,
  apiClient,
} from "@tests/helpers/factory";

describe("TestEntityContactAPIEndpoints", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let entityId: string;
  let outraEntidadeId: string;
  let tipoId: string;
  let tipoSistemaId: string;

  const contatos = () => `/workspaces/${wsSlug}/entity-contacts/`;
  const tipos = () => `/workspaces/${wsSlug}/entity-contact-types/`;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);

    entityId = (await createEntity(ws.id, {name: "Prefeitura de Sidrolândia"})).id;
    outraEntidadeId = (await createEntity(ws.id, {name: "Câmara de Maracaju"})).id;

    const tipoRes = await client.post(tipos(), {name: "Secretário (a)", legacy_id: 3, sequence: 3});
    tipoId = ((await tipoRes.json()) as any).id;
    const sistemaRes = await client.post(tipos(), {name: "Técnico T.I.", legacy_id: 7, is_system_user: true, sequence: 7});
    tipoSistemaId = ((await sistemaRes.json()) as any).id;
  });

  afterAll(() => cleanDb());

  // ── Tipos ───────────────────────────────────────────────────────────────────

  it("cria tipo de responsável e devolve snake_case", async () => {
    const res = await client.post(tipos(), {name: "Prefeito (a)", legacy_id: 2, sequence: 2});
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.name).toBe("Prefeito (a)");
    expect(data.is_active).toBe(true);
    expect(data.is_system_user).toBe(false);
    expect(data.legacy_id).toBe(2);
  });

  it("tipo duplicado devolve 409", async () => {
    const res = await client.post(tipos(), {name: "Secretário (a)"});
    expect(res.status).toBe(409);
  });

  it("lista tipos como array puro", async () => {
    const res = await client.get(tipos());
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data.some((t: any) => t.name === "Técnico T.I." && t.is_system_user === true)).toBe(true);
  });

  it("altera e apaga tipo", async () => {
    const criado = (await (await client.post(tipos(), {name: "Temporário"})).json()) as any;
    const patch = await client.patch(`${tipos()}${criado.id}/`, {is_active: false, name: "Descontinuado"});
    expect(patch.status).toBe(200);
    const alterado = (await patch.json()) as any;
    expect(alterado.name).toBe("Descontinuado");
    expect(alterado.is_active).toBe(false);

    const del = await client.delete(`${tipos()}${criado.id}/`);
    expect(del.status).toBe(204);
  });

  // ── Responsáveis ────────────────────────────────────────────────────────────

  it("cria responsável derivando phone_digits do telefone com máscara", async () => {
    const res = await client.post(contatos(), {
      entity_id: entityId,
      type_id: tipoId,
      name: "Fulano de Tal",
      email: "fulano@x.gov.br",
      phone: "(67) 99999-0000",
      birth_date: "1980-05-01",
      notes: "recebe o técnico",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.phone).toBe("(67) 99999-0000");
    expect(data.phone_digits).toBe("5567999990000");
    expect(data.entity_id).toBe(entityId);
    expect(data.entity_name).toBe("Prefeitura de Sidrolândia");
    expect(data.type_id).toBe(tipoId);
    expect(data.type_name).toBe("Secretário (a)");
    expect(data.is_system_user).toBe(false);
    expect(data.birth_date).toBe("1980-05-01");
    expect(data.is_active).toBe(true);
    expect(data.receive_messages).toBe(true);
    expect(data.user_id).toBeNull();
  });

  it("phone_digits enviado pelo cliente é ignorado", async () => {
    const res = await client.post(contatos(), {
      name: "Cliente Metido",
      phone: "67 98888-1111",
      phone_digits: "000000000000",
    });
    const data = (await res.json()) as any;
    expect(data.phone_digits).toBe("5567988881111");
  });

  it("número que já vem com DDI não ganha outro 55", async () => {
    const res = await client.post(contatos(), {name: "Com DDI", phone: "+55 67 3333-4444"});
    const data = (await res.json()) as any;
    expect(data.phone_digits).toBe("556733334444");
  });

  it("is_system_user vem do tipo", async () => {
    const res = await client.post(contatos(), {name: "Técnico da Casa", type_id: tipoSistemaId});
    const data = (await res.json()) as any;
    expect(data.is_system_user).toBe(true);
  });

  it("responsável sem nome devolve 400", async () => {
    const res = await client.post(contatos(), {entity_id: entityId});
    expect(res.status).toBe(400);
  });

  it("entidade de fora do espaço de trabalho devolve 400", async () => {
    const outroDono = await createUser();
    const outroWs = await createWorkspace(outroDono.id);
    const entidadeAlheia = await createEntity(outroWs.id, {name: "Entidade Alheia"});
    const res = await client.post(contatos(), {name: "Intruso", entity_id: entidadeAlheia.id});
    expect(res.status).toBe(400);
  });

  it("listagem devolve array puro sem envelope de paginação", async () => {
    const res = await client.get(contatos());
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect((data as any).results).toBeUndefined();
  });

  it("listagem com per_page devolve envelope paginado", async () => {
    const res = await client.get(`${contatos()}?per_page=1`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(Array.isArray(data)).toBe(false);
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(1);
    expect(typeof data.total_count).toBe("number");
  });

  it("filtra por entity_id", async () => {
    await client.post(contatos(), {name: "Da Câmara", entity_id: outraEntidadeId});
    const res = await client.get(`${contatos()}?entity_id=${outraEntidadeId}`);
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((c) => c.entity_id === outraEntidadeId)).toBe(true);
  });

  it("filtra por type_id", async () => {
    const res = await client.get(`${contatos()}?type_id=${tipoSistemaId}`);
    const data = (await res.json()) as any[];
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((c) => c.type_id === tipoSistemaId)).toBe(true);
  });

  it("filtra por is_active", async () => {
    const criado = (await (await client.post(contatos(), {name: "Desligado"})).json()) as any;
    await client.patch(`${contatos()}${criado.id}/`, {is_active: false});

    const inativos = (await (await client.get(`${contatos()}?is_active=false`)).json()) as any[];
    expect(inativos.some((c) => c.id === criado.id)).toBe(true);

    const ativos = (await (await client.get(`${contatos()}?is_active=true`)).json()) as any[];
    expect(ativos.some((c) => c.id === criado.id)).toBe(false);
  });

  it("filtra por has_phone", async () => {
    const semTelefone = (await (await client.post(contatos(), {name: "Sem Telefone"})).json()) as any;

    const com = (await (await client.get(`${contatos()}?has_phone=true`)).json()) as any[];
    expect(com.length).toBeGreaterThan(0);
    expect(com.every((c) => !!c.phone_digits)).toBe(true);
    expect(com.some((c) => c.id === semTelefone.id)).toBe(false);

    const sem = (await (await client.get(`${contatos()}?has_phone=false`)).json()) as any[];
    expect(sem.every((c) => c.phone_digits === null)).toBe(true);
    expect(sem.some((c) => c.id === semTelefone.id)).toBe(true);
  });

  it("busca por telefone com máscara, por nome e por e-mail", async () => {
    const porMascara = (await (await client.get(`${contatos()}?search=${encodeURIComponent("(67) 99999-0000")}`)).json()) as any[];
    expect(porMascara.length).toBe(1);
    expect(porMascara[0].name).toBe("Fulano de Tal");

    const porTrecho = (await (await client.get(`${contatos()}?search=99999-0000`)).json()) as any[];
    expect(porTrecho.some((c) => c.name === "Fulano de Tal")).toBe(true);

    const porNome = (await (await client.get(`${contatos()}?search=fulano`)).json()) as any[];
    expect(porNome.some((c) => c.name === "Fulano de Tal")).toBe(true);

    const porEmail = (await (await client.get(`${contatos()}?search=${encodeURIComponent("fulano@x.gov.br")}`)).json()) as any[];
    expect(porEmail.some((c) => c.name === "Fulano de Tal")).toBe(true);
  });

  it("atalho entities/:entity_id/contacts/ tem a mesma forma da listagem", async () => {
    const res = await client.get(`/workspaces/${wsSlug}/entities/${entityId}/contacts/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((c) => c.entity_id === entityId)).toBe(true);
  });

  it("detalha responsável", async () => {
    const lista = (await (await client.get(`${contatos()}?search=fulano`)).json()) as any[];
    const res = await client.get(`${contatos()}${lista[0].id}/`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBe(lista[0].id);
  });

  it("altera responsável e recalcula phone_digits", async () => {
    const criado = (await (await client.post(contatos(), {name: "Antes", phone: "(67) 90000-0000"})).json()) as any;
    const res = await client.patch(`${contatos()}${criado.id}/`, {
      name: "Depois",
      phone: "(67) 91111-2222",
      receive_messages: false,
      entity_id: entityId,
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.name).toBe("Depois");
    expect(data.phone_digits).toBe("5567911112222");
    expect(data.receive_messages).toBe(false);
    expect(data.entity_name).toBe("Prefeitura de Sidrolândia");
  });

  it("limpa o telefone zerando phone_digits", async () => {
    const criado = (await (await client.post(contatos(), {name: "Perdeu o número", phone: "(67) 95555-6666"})).json()) as any;
    const data = (await (await client.patch(`${contatos()}${criado.id}/`, {phone: null})).json()) as any;
    expect(data.phone).toBeNull();
    expect(data.phone_digits).toBeNull();
  });

  it("exclusão é lógica: some da listagem e o detalhe vira 404", async () => {
    const criado = (await (await client.post(contatos(), {name: "Vai Sumir"})).json()) as any;
    const del = await client.delete(`${contatos()}${criado.id}/`);
    expect(del.status).toBe(204);

    const lista = (await (await client.get(contatos())).json()) as any[];
    expect(lista.some((c) => c.id === criado.id)).toBe(false);

    const detalhe = await client.get(`${contatos()}${criado.id}/`);
    expect(detalhe.status).toBe(404);
  });

  it("responsável de outro espaço de trabalho não é visível", async () => {
    const outroDono = await createUser();
    const outroToken = await createApiToken(outroDono.id);
    const outroWs = await createWorkspace(outroDono.id);
    const outroClient = apiClient(outroToken.token);
    const alheio = (await (await outroClient.post(`/workspaces/${outroWs.slug}/entity-contacts/`, {name: "De Fora"})).json()) as any;

    const res = await client.get(`${contatos()}${alheio.id}/`);
    expect(res.status).toBe(404);
  });
});

describe("TestEntityContactPermissions", () => {
  let wsSlug: string;
  let visualizador: ReturnType<typeof apiClient>;
  let atendente: ReturnType<typeof apiClient>;
  let deFora: ReturnType<typeof apiClient>;

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;

    visualizador = apiClient((await createMemberWithToken(ws.id, 5)).token);
    atendente = apiClient((await createMemberWithToken(ws.id, 6)).token);

    const estranho = await createUser();
    deFora = apiClient((await createApiToken(estranho.id)).token);
  });

  afterAll(() => cleanDb());

  it("visualizador lê tudo: o menu Contatos é do espaço inteiro", async () => {
    expect((await visualizador.get(`/workspaces/${wsSlug}/entity-contacts/`)).status).toBe(200);
  });

  it("visualizador não escreve: contato é dado pessoal de terceiro", async () => {
    // O corte é por permissão (INTAKE_CREATE), não por nível: neste fork
    // Atendimento é 6, Qualidade 8 e TI 12 — um corte por nível barraria
    // justamente quem cadastra em campo.
    const criado = await atendente.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Alvo"});
    const {id} = (await criado.json()) as any;

    expect((await visualizador.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Não"})).status).toBe(403);
    expect((await visualizador.patch(`/workspaces/${wsSlug}/entity-contacts/${id}/`, {name: "Não"})).status).toBe(403);
    expect((await visualizador.delete(`/workspaces/${wsSlug}/entity-contacts/${id}/`)).status).toBe(403);
  });

  it("atendimento cria porque o cadastro nasce no encerramento do chat", async () => {
    const res = await atendente.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Veio do Chat", phone: "67988887777"});
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.phone_digits).toBe("5567988887777");
  });

  it("visualizador não administra os tipos", async () => {
    const res = await visualizador.post(`/workspaces/${wsSlug}/entity-contact-types/`, {name: "Criado pelo Visualizador"});
    expect(res.status).toBe(403);
  });

  it("atendimento administra os tipos", async () => {
    expect((await atendente.post(`/workspaces/${wsSlug}/entity-contact-types/`, {name: "Criado no Atendimento"})).status).toBe(201);
  });

  it("quem não é do espaço de trabalho continua barrado", async () => {
    const leitura = await deFora.get(`/workspaces/${wsSlug}/entity-contacts/`);
    expect(leitura.status).toBe(403);

    const escrita = await deFora.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Intruso"});
    expect(escrita.status).toBe(403);
  });
});

describe("TestEntityContactAuditoriaLGPD", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let contatoId: string;

  const contatos = () => `/workspaces/${wsSlug}/entity-contacts/`;

  /**
   * `recordAudit` não é aguardado na resposta: a trilha chega logo depois, então
   * a espera é pela condição do teste — contar registros deixaria passar o log
   * de uma chamada anterior.
   */
  async function esperarRegistros(filtro: string, condicao: (registros: any[]) => boolean = (r) => r.length >= 1) {
    let registros: any[] = [];
    for (let tentativa = 0; tentativa < 25; tentativa++) {
      const res = await client.get(`/workspaces/${wsSlug}/audit-logs/?${filtro}`);
      registros = ((await res.json()) as any).results ?? [];
      if (condicao(registros)) break;
      await new Promise((resolver) => setTimeout(resolver, 40));
    }
    return registros;
  }

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);
  });

  afterAll(() => cleanDb());

  it("criação grava registro de auditoria", async () => {
    const criado = (await (await client.post(contatos(), {name: "Auditado", phone: "(67) 98877-6655"})).json()) as any;
    contatoId = criado.id;

    const registros = await esperarRegistros(`entity=entity_contact&entity_id=${contatoId}&action=create`);
    expect(registros.length).toBe(1);
    expect(registros[0].actor_id).toBeTruthy();
  });

  it("leitura do detalhe grava registro", async () => {
    await client.get(`${contatos()}${contatoId}/`);
    const registros = await esperarRegistros(`entity=entity_contact&entity_id=${contatoId}&action=view`);
    expect(registros.length).toBeGreaterThanOrEqual(1);
  });

  it("listagem grava registro com o total e os filtros usados", async () => {
    await client.get(`${contatos()}?search=Auditado`);
    const registros = await esperarRegistros(`entity=entity_contact&action=list`, (r) =>
      r.some((log: any) => log.metadata?.filtros?.search === "Auditado"),
    );
    const comBusca = registros.find((r: any) => r.metadata?.filtros?.search === "Auditado");
    expect(comBusca).toBeDefined();
    expect(comBusca.metadata.total).toBe(1);
  });

  it("atalho da entidade também grava a leitura", async () => {
    const entidade = (await (await client.post(`/workspaces/${wsSlug}/entities/`, {name: "Órgão Auditado"})).json()) as any;
    await client.get(`/workspaces/${wsSlug}/entities/${entidade.id}/contacts/`);
    const registros = await esperarRegistros(`entity=entity_contact&action=list`, (r) =>
      r.some((log: any) => log.metadata?.filtros?.entity_id === entidade.id),
    );
    expect(registros.some((r: any) => r.metadata?.filtros?.entity_id === entidade.id)).toBe(true);
  });

  it("alteração grava o que mudou sem copiar o dado pessoal", async () => {
    await client.patch(`${contatos()}${contatoId}/`, {name: "Auditado II", phone: "(67) 98877-0000", is_active: false});
    const registros = await esperarRegistros(`entity=entity_contact&entity_id=${contatoId}&action=update`);
    expect(registros.length).toBe(1);
    const log = registros[0];
    expect(log.changes.name).toEqual({de: "Auditado", para: "Auditado II"});
    expect(log.changes.isActive).toEqual({de: true, para: false});
    expect(log.changes.phone).toBeUndefined();
    expect(log.metadata.campos_pessoais_alterados).toContain("phone");
    expect(log.metadata.campos_pessoais_alterados).toContain("phoneDigits");
    expect(JSON.stringify(log)).not.toContain("98877-0000");
  });

  it("exclusão grava registro", async () => {
    await client.delete(`${contatos()}${contatoId}/`);
    const registros = await esperarRegistros(`entity=entity_contact&entity_id=${contatoId}&action=delete`);
    expect(registros.length).toBe(1);
    expect(registros[0].metadata.logica).toBe(true);
  });

  it("rotas de tipos também deixam trilha", async () => {
    const tipo = (await (await client.post(`/workspaces/${wsSlug}/entity-contact-types/`, {name: "Auditável"})).json()) as any;
    await client.get(`/workspaces/${wsSlug}/entity-contact-types/`);
    await client.patch(`/workspaces/${wsSlug}/entity-contact-types/${tipo.id}/`, {is_active: false});
    await client.delete(`/workspaces/${wsSlug}/entity-contact-types/${tipo.id}/`);

    const registros = await esperarRegistros(`entity=entity_contact_type`, (r) => r.length >= 4);
    const acoes = new Set(registros.map((r: any) => r.action));
    expect(acoes.has("create")).toBe(true);
    expect(acoes.has("list")).toBe(true);
    expect(acoes.has("update")).toBe(true);
    expect(acoes.has("delete")).toBe(true);
  });
});

describe("TestTechnicalVisitContacts", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let entityId: string;
  let contatoA: string;
  let contatoB: string;

  const visitas = () => `/workspaces/${wsSlug}/technical-visits/`;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    client = apiClient(token.token);
    entityId = (await createEntity(ws.id, {name: "Prefeitura da Visita"})).id;

    const criar = async (name: string, phone: string) =>
      ((await (await client.post(`/workspaces/${wsSlug}/entity-contacts/`, {name, phone, entity_id: entityId})).json()) as any).id;
    contatoA = await criar("Responsável A", "(67) 99111-1111");
    contatoB = await criar("Responsável B", "(67) 99222-2222");
  });

  afterAll(() => cleanDb());

  it("cria visita com contact_ids e devolve contact_records sem perder o texto contacts", async () => {
    const res = await client.post(visitas(), {
      entity_id: entityId,
      scheduled_date: "2026-09-10",
      contacts: "João da portaria (texto do SAC)",
      contact_ids: [contatoA],
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.contacts).toBe("João da portaria (texto do SAC)");
    expect(data.contact_records).toBeInstanceOf(Array);
    expect(data.contact_records.length).toBe(1);
    expect(data.contact_records[0].id).toBe(contatoA);
    expect(data.contact_records[0].phone_digits).toBe("5567991111111");
  });

  it("PATCH substitui o conjunto de responsáveis e preserva o texto", async () => {
    const criada = (await (await client.post(visitas(), {
      entity_id: entityId,
      contacts: "texto legado",
      contact_ids: [contatoA],
    })).json()) as any;

    const res = await client.patch(`${visitas()}${criada.id}/`, {contact_ids: [contatoB]});
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.contact_records.map((c: any) => c.id)).toEqual([contatoB]);
    expect(data.contacts).toBe("texto legado");
  });

  it("PATCH com lista vazia desvincula todos", async () => {
    const criada = (await (await client.post(visitas(), {entity_id: entityId, contact_ids: [contatoA, contatoB]})).json()) as any;
    expect(criada.contact_records.length).toBe(2);

    const data = (await (await client.patch(`${visitas()}${criada.id}/`, {contact_ids: []})).json()) as any;
    expect(data.contact_records).toEqual([]);
  });

  it("PATCH sem contact_ids não mexe nos vínculos", async () => {
    const criada = (await (await client.post(visitas(), {entity_id: entityId, contact_ids: [contatoA]})).json()) as any;
    const data = (await (await client.patch(`${visitas()}${criada.id}/`, {city: "Campo Grande"})).json()) as any;
    expect(data.city).toBe("Campo Grande");
    expect(data.contact_records.map((c: any) => c.id)).toEqual([contatoA]);
  });

  it("responsável inexistente devolve 400", async () => {
    const res = await client.post(visitas(), {
      entity_id: entityId,
      contact_ids: ["00000000-0000-4000-8000-000000000000"],
    });
    expect(res.status).toBe(400);
  });

  it("listagem e detalhe também trazem contact_records", async () => {
    const criada = (await (await client.post(visitas(), {entity_id: entityId, contact_ids: [contatoA]})).json()) as any;

    const detalhe = (await (await client.get(`${visitas()}${criada.id}/`)).json()) as any;
    expect(detalhe.contact_records.map((c: any) => c.id)).toEqual([contatoA]);

    const lista = (await (await client.get(visitas())).json()) as any;
    const naLista = lista.results.find((v: any) => v.id === criada.id);
    expect(naLista.contact_records.map((c: any) => c.id)).toEqual([contatoA]);
  });

  it("responsável apagado sai de contact_records", async () => {
    const criada = (await (await client.post(visitas(), {entity_id: entityId, contact_ids: [contatoA, contatoB]})).json()) as any;
    const descartavel = (await (await client.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Some Depois"})).json()) as any;
    await client.patch(`${visitas()}${criada.id}/`, {contact_ids: [contatoA, descartavel.id]});
    await client.delete(`/workspaces/${wsSlug}/entity-contacts/${descartavel.id}/`);

    const detalhe = (await (await client.get(`${visitas()}${criada.id}/`)).json()) as any;
    expect(detalhe.contact_records.map((c: any) => c.id)).toEqual([contatoA]);
  });
});

describe("TestEntityContactTelefone", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;

  const criar = (phone: string) =>
    client.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Fulano", phone});

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    client = apiClient((await createApiToken(dono.id)).token);
  });

  afterAll(() => cleanDb());

  it("aceita celular com máscara e deriva o DDI", async () => {
    const res = await criar("(67) 99999-0000");
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).phone_digits).toBe("5567999990000");
  });

  it("aceita fixo de 10 dígitos", async () => {
    expect((await criar("6733210000")).status).toBe(201);
  });

  it("aceita número que já vem com DDI (é assim que o chat cadastra)", async () => {
    const res = await criar("5567999991111");
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).phone_digits).toBe("5567999991111");
  });

  it("recusa dígitos infinitos", async () => {
    // O SAC guardava texto livre; era possível digitar sem fim.
    expect((await criar("6799999000012345678")).status).toBe(400);
  });

  it("recusa número curto demais", async () => {
    expect((await criar("99999")).status).toBe(400);
  });

  it("recusa celular de 11 dígitos que não começa com 9", async () => {
    expect((await criar("67199990000")).status).toBe(400);
  });

  it("recusa DDD começando com zero", async () => {
    expect((await criar("0733210000")).status).toBe(400);
  });

  it("telefone vazio continua válido: o campo é opcional", async () => {
    expect((await client.post(`/workspaces/${wsSlug}/entity-contacts/`, {name: "Sem Telefone"})).status).toBe(201);
    const res = await criar("");
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).phone_digits).toBeNull();
  });

  it("contato legado com número irregular continua editável", async () => {
    // A base do SAC tem 77 celulares de 11 dígitos sem o 9 e 76 com DDD zerado.
    // Abrir um desses só para corrigir o nome não pode falhar por causa do
    // telefone que ninguém tocou.
    const legado = await prisma.entityContact.create({
      data: {workspaceId: wsId, name: "Legado", phone: "67188887777", phoneDigits: "5567188887777"},
    });
    const res = await client.patch(`/workspaces/${wsSlug}/entity-contacts/${legado.id}/`, {
      name: "Legado Renomeado",
      phone: "67188887777",
    });
    expect(res.status).toBe(200);

    // Mas trocar o número exige a regra atual.
    expect(
      (await client.patch(`/workspaces/${wsSlug}/entity-contacts/${legado.id}/`, {phone: "67188886666"})).status
    ).toBe(400);
  });

  it("a validação também vale para a edição", async () => {
    const criado = (await criar("(67) 99999-2222")).json() as any;
    const {id} = await criado;
    expect((await client.patch(`/workspaces/${wsSlug}/entity-contacts/${id}/`, {phone: "123"})).status).toBe(400);
  });
});
