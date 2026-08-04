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
