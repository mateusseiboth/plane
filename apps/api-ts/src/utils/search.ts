/**
 * PostgreSQL full-text + trigram search infrastructure.
 *
 * We rely on native Postgres features instead of application-side fuzzy term
 * generation:
 *   - `tsvector` / `websearch_to_tsquery` for stemmed, language-aware matching
 *   - `pg_trgm` (`%` operator, `similarity()`) for typo / transposition tolerance
 *   - `unaccent` (via a custom `pt_unaccent` text-search config) so accented and
 *     unaccented spellings match interchangeably
 *
 * `ensureSearchIndexes()` is idempotent: it creates the extensions, the custom
 * text-search configuration and the GIN indexes if they are missing, then runs
 * ANALYZE. It is safe to call on every boot and is also exposed through an
 * authenticated reindex route so operators can refresh statistics on demand.
 */
import prisma from "@db";

/** Name of the custom text-search configuration (portuguese + unaccent). */
export const PT_FTS_CONFIG = "pt_unaccent";

/**
 * SQL expression that builds the searchable document for an issue row.
 * MUST stay byte-for-byte identical to the indexed expression in
 * `ensureSearchIndexes()` so the planner can use `idx_issues_fts`.
 */
export const ISSUE_FTS_DOC = `to_tsvector('${PT_FTS_CONFIG}', coalesce(name,'') || ' ' || coalesce(description_stripped,'') || ' ' || coalesce(legacy_ticket_number,''))`;

/** Same as {@link ISSUE_FTS_DOC} but for a query aliased as `i`. */
export const ISSUE_FTS_DOC_I = `to_tsvector('${PT_FTS_CONFIG}', coalesce(i.name,'') || ' ' || coalesce(i.description_stripped,'') || ' ' || coalesce(i.legacy_ticket_number,''))`;

/** Searchable document for an issue comment (alias `c`). */
export const COMMENT_FTS_DOC_C = `to_tsvector('${PT_FTS_CONFIG}', coalesce(c.comment_stripped,''))`;

// DDL statements, executed one at a time (CREATE INDEX cannot run inside a tx
// block alongside other statements, so we keep them separate and idempotent).
const STATEMENTS: string[] = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE EXTENSION IF NOT EXISTS unaccent`,
  // Portuguese config that strips accents before stemming. to_tsvector with a
  // constant config is IMMUTABLE, so it is valid inside an index expression.
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = '${PT_FTS_CONFIG}') THEN
       CREATE TEXT SEARCH CONFIGURATION ${PT_FTS_CONFIG} (COPY = portuguese);
       ALTER TEXT SEARCH CONFIGURATION ${PT_FTS_CONFIG}
         ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem;
     END IF;
   END
   $$`,
  // Full-text GIN index over title + description + legacy ticket number.
  `CREATE INDEX IF NOT EXISTS idx_issues_fts ON issues USING gin (${ISSUE_FTS_DOC}) WHERE deleted_at IS NULL`,
  // Trigram indexes for typo tolerance on the short, high-signal fields.
  `CREATE INDEX IF NOT EXISTS idx_issues_name_trgm ON issues USING gin (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_issues_legacy_trgm ON issues USING gin (legacy_ticket_number gin_trgm_ops)`,
  // Comment full-text + trigram so matches inside conversations surface too.
  `CREATE INDEX IF NOT EXISTS idx_comments_fts ON issue_comments USING gin (to_tsvector('${PT_FTS_CONFIG}', coalesce(comment_stripped,''))) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_comments_trgm ON issue_comments USING gin (comment_stripped gin_trgm_ops)`,
];

const ANALYZE_STATEMENTS = [`ANALYZE issues`, `ANALYZE issue_comments`];

export type EnsureSearchResult = {
  ok: boolean;
  applied: string[];
  errors: { statement: string; error: string }[];
};

/**
 * Create (if missing) every extension, config and index required by the search
 * endpoint, then refresh planner statistics. Idempotent and safe to re-run.
 *
 * @param analyze when false, skips the ANALYZE pass (used on cheap boot calls).
 */
export async function ensureSearchIndexes(analyze = true): Promise<EnsureSearchResult> {
  const result: EnsureSearchResult = { ok: true, applied: [], errors: [] };
  const stmts = analyze ? [...STATEMENTS, ...ANALYZE_STATEMENTS] : STATEMENTS;
  for (const stmt of stmts) {
    try {
      await prisma.$executeRawUnsafe(stmt);
      result.applied.push(stmt.split("\n")[0].trim());
    } catch (e: any) {
      result.ok = false;
      result.errors.push({ statement: stmt.split("\n")[0].trim(), error: e?.message ?? String(e) });
    }
  }
  return result;
}
