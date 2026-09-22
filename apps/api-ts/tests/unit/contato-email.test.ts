/**
 * Lista de e-mails dos responsáveis para disparo: filtros (entidade, tipo de
 * entidade, sistema), opt-in (`receive_messages`), usuários internos,
 * deduplicação e o CSV. DAO mockado; sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import {
  BOM,
  buildContatoWhere,
  buildEmailsCsv,
  mergeEmails,
  readFiltrosDaLista,
} from "@modules/contato-email/contato-email.rules";
import { createContatoEmailService, type ContatoEmailDeps } from "@modules/contato-email/contato-email.service";

const WS = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const E1 = "44444444-4444-4444-8444-444444444444";

describe("readFiltrosDaLista", () => {
  it("lê entidade, tipo, sistemas (lista) e internos", () => {
    expect(
      readFiltrosDaLista({ entity_id: E1, entity_type: "2", project_ids: `${P1},${P2},lixo`, include_members: "true" })
    ).toEqual({ entityId: E1, entityType: 2, projectIds: [P1, P2], isWithMembers: true });
  });

  it("ignora o que não é id nem número", () => {
    expect(readFiltrosDaLista({ entity_id: "x", entity_type: "abc" })).toEqual({
      entityId: null,
      entityType: null,
      projectIds: [],
      isWithMembers: false,
    });
  });
});

describe("buildContatoWhere", () => {
  it("só responsável ativo, que aceita mensagens, com e-mail e entidade ativa não congelada", () => {
    expect(buildContatoWhere(WS, readFiltrosDaLista({}))).toEqual({
      workspaceId: WS,
      deletedAt: null,
      isActive: true,
      receiveMessages: true,
      email: { not: null },
      entity: { deletedAt: null, isActive: true, frozenAt: null },
    });
  });

  it("aplica entidade, tipo e sistema", () => {
    const where = buildContatoWhere(WS, { entityId: E1, entityType: 2, projectIds: [P1], isWithMembers: false });
    expect(where).toMatchObject({
      entityId: E1,
      entity: { deletedAt: null, isActive: true, frozenAt: null, entityType: 2 },
      projects: { some: { projectId: { in: [P1] } } },
    });
  });
});

describe("mergeEmails", () => {
  it("junta, tira repetidos (sem diferenciar maiúscula), descarta inválidos e ordena", () => {
    const itens = mergeEmails([
      { email: "Ana@Pref.gov.br ", name: "Ana", entity_name: "Prefeitura", origem: "responsavel" },
      { email: "ana@pref.gov.br", name: "Ana 2", entity_name: "Câmara", origem: "responsavel" },
      { email: "sem-arroba", name: "X", entity_name: null, origem: "responsavel" },
      { email: "bruno@quality.com.br", name: "Bruno", entity_name: null, origem: "interno" },
    ]);
    expect(itens).toEqual([
      { email: "ana@pref.gov.br", name: "Ana", entity_name: "Prefeitura", origem: "responsavel" },
      { email: "bruno@quality.com.br", name: "Bruno", entity_name: null, origem: "interno" },
    ]);
  });
});

describe("buildEmailsCsv", () => {
  it("separado por ponto e vírgula, com BOM e aspas escapadas", () => {
    const csv = buildEmailsCsv([{ email: "a@b.com", name: 'Ana "A"', entity_name: "Pref; X", origem: "responsavel" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe(BOM + 'e-mail;nome;entidade;origem\r\na@b.com;"Ana ""A""";"Pref; X";Responsável\r\n');
  });
});

describe("ContatoEmailService.build", () => {
  const makeService = (over: Record<string, unknown> = {}) => {
    const dao = {
      findContatos: mock(async () => [{ email: "ana@pref.gov.br", name: "Ana", entity: { name: "Prefeitura" } }]),
      findMembros: mock(async () => [{ email: "bruno@quality.com.br", displayName: "Bruno" }]),
      ...over,
    } as unknown as ContatoEmailDeps["dao"];
    return { service: createContatoEmailService({ dao }), dao };
  };

  it("sem internos: não consulta os membros", async () => {
    const { service, dao } = makeService();
    const lista = await service.build(WS, {});
    expect(lista.emails).toEqual(["ana@pref.gov.br"]);
    expect(lista.total).toBe(1);
    expect(dao.findMembros).not.toHaveBeenCalled();
  });

  it("com internos: soma os membros ativos do espaço", async () => {
    const { service } = makeService();
    const lista = await service.build(WS, { include_members: "true" });
    expect(lista.emails).toEqual(["ana@pref.gov.br", "bruno@quality.com.br"]);
    expect(lista.items[1]).toEqual({
      email: "bruno@quality.com.br",
      name: "Bruno",
      entity_name: null,
      origem: "interno",
    });
  });
});
