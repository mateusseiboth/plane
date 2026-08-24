/**
 * Infraestrutura de busca (FTS + trigram). ensureSearchIndexes roda no boot e
 * numa rota de reindex autenticada, então precisa ser idempotente e nunca
 * derrubar a aplicação quando um statement falha.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import prisma from "@db";
import {cleanDb} from "@tests/helpers/setup";
import {createIssue, createProject, createUser, createWorkspace} from "@tests/helpers/factory";
import {
  buscarChamados,
  chaveDoChamado,
  COMMENT_FTS_DOC_C,
  ISSUE_FTS_DOC,
  ISSUE_FTS_DOC_I,
  PT_FTS_CONFIG,
  ensureSearchIndexes,
} from "@utils/search";

describe("expressões de documento", () => {
  it("usam a configuração pt_unaccent", () => {
    expect(PT_FTS_CONFIG).toBe("pt_unaccent");
    expect(ISSUE_FTS_DOC).toContain(`to_tsvector('pt_unaccent'`);
    expect(COMMENT_FTS_DOC_C).toContain("c.comment_stripped");
  });

  it("a variante com alias `i` é idêntica, apenas qualificada", () => {
    expect(ISSUE_FTS_DOC_I).toBe(ISSUE_FTS_DOC.replace(/coalesce\(/g, "coalesce(i."));
  });

  it("o documento do chamado cobre título, descrição e número legado", () => {
    for (const col of ["name", "description_stripped", "legacy_ticket_number"]) {
      expect(ISSUE_FTS_DOC).toContain(col);
    }
  });
});

describe("ensureSearchIndexes", () => {
  beforeAll(() => cleanDb());
  afterAll(() => cleanDb());

  it("cria extensões, configuração e índices sem erro", async () => {
    const result = await ensureSearchIndexes();
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.applied.some((s) => s.includes("pg_trgm"))).toBe(true);
    expect(result.applied.some((s) => s.includes("idx_issues_fts"))).toBe(true);
    expect(result.applied).toContain("ANALYZE issues");
  });

  it("é idempotente (segunda execução também termina ok)", async () => {
    const result = await ensureSearchIndexes();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("analyze=false pula o ANALYZE", async () => {
    const result = await ensureSearchIndexes(false);
    expect(result.ok).toBe(true);
    expect(result.applied).not.toContain("ANALYZE issues");
    expect(result.applied).not.toContain("ANALYZE issue_comments");
  });

  it("cria de fato o índice FTS e a configuração de texto", async () => {
    const idx = await prisma.$queryRawUnsafe<{indexname: string}[]>(
      `SELECT indexname FROM pg_indexes WHERE indexname = 'idx_issues_fts'`,
    );
    expect(idx).toHaveLength(1);
    const cfg = await prisma.$queryRawUnsafe<{cfgname: string}[]>(
      `SELECT cfgname FROM pg_ts_config WHERE cfgname = '${PT_FTS_CONFIG}'`,
    );
    expect(cfg).toHaveLength(1);
  });

  it("o documento indexado casa busca sem acento (unaccent)", async () => {
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    const project = await createProject(ws.id, user.id);
    await createIssue(project.id, ws.id, {name: "Manutenção de impressora", descriptionStripped: "trocar o toner"});

    const rows = await prisma.$queryRawUnsafe<{id: string}[]>(
      `SELECT id FROM issues WHERE ${ISSUE_FTS_DOC} @@ websearch_to_tsquery('${PT_FTS_CONFIG}', 'manutencao')`,
    );
    expect(rows).toHaveLength(1);
  });

  it("busca por número legado usa o mesmo documento", async () => {
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    const project = await createProject(ws.id, user.id);
    await createIssue(project.id, ws.id, {name: "Chamado antigo", legacyTicketNumber: "458325"});

    const rows = await prisma.$queryRawUnsafe<{id: string}[]>(
      `SELECT id FROM issues WHERE ${ISSUE_FTS_DOC} @@ websearch_to_tsquery('${PT_FTS_CONFIG}', '458325')`,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("chaveDoChamado", () => {
  it("lê a chave composta como ela aparece na tela", () => {
    expect(chaveDoChamado("ALMOXA-954")).toEqual({identificador: "ALMOXA", sequencial: 954});
  });

  // O identificador sai como foi digitado; quem compara sem diferenciar caixa é
  // a consulta (`upper(p.identifier) = upper(...)`).
  it("aceita as grafias que gente digita", () => {
    for (const digitado of ["almoxa-954", "ALMOXA 954", "almoxa 954", "ALMOXA_954", "  ALMOXA - 954  "]) {
      const chave = chaveDoChamado(digitado);
      expect(chave?.identificador.toUpperCase()).toBe("ALMOXA");
      expect(chave?.sequencial).toBe(954);
    }
  });

  it("não confunde número legado nem texto solto com chave de chamado", () => {
    for (const digitado of ["500-2026", "954", "Cálculo IPTU", "", "-954", "ALMOXA-"]) {
      expect(chaveDoChamado(digitado)).toBeNull();
    }
  });
});

describe("buscarChamados", () => {
  // O chamado do defeito: ALMOXA-954 "Cálculo IPTU", sem número legado. Procurar
  // pela chave composta não achava nada, porque a busca da paleta só olhava
  // título e número legado.
  let workspaceId = "";
  let chamadoId = "";
  let legadoId = "";

  beforeAll(async () => {
    await cleanDb();
    await ensureSearchIndexes(false);
    const user = await createUser();
    const ws = await createWorkspace(user.id);
    workspaceId = ws.id;
    const almox = await createProject(ws.id, user.id, {name: "Almoxarifado", identifier: "ALMOXA"});
    const siart = await createProject(ws.id, user.id, {name: "SIART Web", identifier: "SIARTW"});
    chamadoId = (await createIssue(almox.id, ws.id, {name: "Cálculo IPTU", sequenceId: 954})).id;
    legadoId = (await createIssue(siart.id, ws.id, {name: "Projeção", sequenceId: 32, legacyTicketNumber: "500-2026"}))
      .id;
    await createIssue(almox.id, ws.id, {name: "Saída de produtos", sequenceId: 51, legacyTicketNumber: "954-2025"});
  });

  afterAll(() => cleanDb());

  it("acha pela chave composta que a pessoa copia da tela", async () => {
    const achados = await buscarChamados(workspaceId, "ALMOXA-954", 10);
    expect(achados[0]?.id).toBe(chamadoId);
  });

  it("acha nas grafias que gente digita", async () => {
    for (const digitado of ["almoxa-954", "ALMOXA 954", "#ALMOXA-954"]) {
      const achados = await buscarChamados(workspaceId, digitado, 10);
      expect(achados[0]?.id).toBe(chamadoId);
    }
  });

  it("continua achando pelo número do chamado legado", async () => {
    for (const digitado of ["500-2026", "500/2026", "#500-2026"]) {
      const achados = await buscarChamados(workspaceId, digitado, 10);
      expect(achados[0]?.id).toBe(legadoId);
    }
  });

  it("o número solto continua achando os números legados que o contêm", async () => {
    const achados = await buscarChamados(workspaceId, "954", 10);
    expect(achados.map((c) => c.legacy_ticket_number)).toContain("954-2025");
  });

  it("devolve o projeto e o estado junto, que é o que as duas rotas serializam", async () => {
    const [achado] = await buscarChamados(workspaceId, "ALMOXA-954", 10);
    expect(achado.project_identifier).toBe("ALMOXA");
    expect(achado.sequence_id).toBe(954);
    expect(achado.name).toBe("Cálculo IPTU");
  });

  it("termo vazio não busca nada", async () => {
    expect(await buscarChamados(workspaceId, "   ", 10)).toEqual([]);
  });
});
