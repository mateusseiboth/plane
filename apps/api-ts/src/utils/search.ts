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
import { Prisma } from "@prisma/client";

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

/**
 * Documento só do título (alias `i`), usado no RANQUEAMENTO — nunca no filtro.
 *
 * Ranquear pelo documento completo obriga o Postgres a montar o `tsvector` de
 * título + descrição de cada linha encontrada: numa busca ampla ("erro", 20 mil
 * chamados) isso sozinho custava ~3 s. O título é curto, cabe no orçamento e é o
 * sinal que o usuário realmente espera ver no topo.
 */
export const ISSUE_TITLE_DOC_I = `to_tsvector('${PT_FTS_CONFIG}', coalesce(i.name,''))`;

/** Searchable document for an issue comment (alias `c`). */
export const COMMENT_FTS_DOC_C = `to_tsvector('${PT_FTS_CONFIG}', coalesce(c.comment_stripped,''))`;

/**
 * Grafia canônica de um número de chamado legado, ou null quando o termo não
 * tem cara de número legado.
 *
 * O SAC gravava "500-2026", mas quem procura digita do jeito que lembra:
 * "500/2026", "500 2026", "500.2026" ou "5002026". Traduzir para a grafia
 * gravada deixa a busca casar pelo índice de trigrama, sem varrer a tabela.
 *
 * Devolve null quando a grafia digitada já é a canônica — aí não há busca extra
 * a fazer.
 */
export function grafiaCanonicaDoNumeroLegado(termo: string): string | null {
  const limpo = termo.trim();

  const comSeparador = /^(\d{1,6})\s*[-/._\s]\s*(\d{2,4})$/.exec(limpo);
  if (comSeparador) {
    const canonica = `${comSeparador[1]}-${comSeparador[2]}`;
    return canonica === limpo ? null : canonica;
  }

  // "5002026" → "500-2026". Só quando os quatro últimos dígitos são um ano
  // plausível; caso contrário é um número solto e não se deve inventar hífen.
  const coladas = /^(\d{1,6})(\d{4})$/.exec(limpo);
  if (coladas) {
    const ano = Number(coladas[2]);
    if (ano >= 1990 && ano <= 2099) return `${coladas[1]}-${coladas[2]}`;
  }

  return null;
}

/**
 * Chave composta "IDENTIFICADOR-sequencial" ("ALMOXA-954"), ou null quando o
 * termo não tem essa cara.
 *
 * É assim que o chamado aparece na tela, nos links e nos e-mails, então é assim
 * que a pessoa copia e cola. Aceita as grafias que gente digita: minúscula
 * ("almoxa-954"), com espaço ("ALMOXA 954"), com sublinhado ou barra.
 */
export function chaveDoChamado(termo: string): { identificador: string; sequencial: number } | null {
  const casou = /^([A-Za-z][A-Za-z0-9]*)[-\s_/]+(\d{1,10})$/.exec(termo.trim());
  if (!casou) return null;
  return { identificador: casou[1], sequencial: Number(casou[2]) };
}

/** Uma linha de chamado devolvida por {@link buscarChamados}. */
export type ChamadoEncontrado = {
  id: string;
  name: string;
  sequence_id: number;
  priority: string;
  legacy_ticket_number: string | null;
  state_group: string | null;
  state_name: string | null;
  project_id: string | null;
  project_identifier: string | null;
  project_name: string | null;
};

/**
 * A busca de chamados do espaço de trabalho — **a única**.
 *
 * Existiam duas: esta, completa, atrás de `/global-search/`, e uma segunda,
 * curta, dentro de `/search/` (a que a paleta ⌘K usa), que só olhava o título e
 * o número legado. Por causa disso, procurar "ALMOXA-954" na paleta não achava
 * nada enquanto a mesma busca em `/global-search/` devolvia o chamado no topo.
 * Duas implementações da mesma pergunta é o defeito; as rotas agora chamam esta
 * função e só mudam o formato da resposta.
 *
 * A consulta é escrita como UNIÃO de buscas independentes, uma por índice, e
 * NÃO como um `OR` gigante. O motivo é o plano de execução: um `OR` que mistura
 * colunas diferentes e um `EXISTS` em comentários não é conversível em varredura
 * por índice, então o Postgres varria as 51 mil linhas de `issues` calculando
 * `to_tsvector` em cada uma — 13 s a 23 s por busca. Com a união, cada braço
 * entra pelo seu GIN (idx_issues_fts, idx_issues_name_trgm,
 * idx_issues_legacy_trgm, idx_comments_fts, idx_issues_project_sequence) e o
 * mesmo resultado sai em dezenas de milissegundos.
 *
 * Braços:
 *  - título + descrição + número legado, com radical e sem acento (FTS)
 *  - título com tolerância a erro de digitação (trigrama)
 *  - número do chamado legado, como a pessoa digita ("500-2026")
 *  - corpo dos comentários (FTS)
 *  - chave composta "ALMOXA-954", quando o termo tem essa cara
 *
 * O trigrama de comentário (`comment_stripped % q`) foi retirado de propósito:
 * medido em produção, custava de 3 s a 8 s e não trazia praticamente nada —
 * similaridade de um termo curto contra um comentário longo quase nunca passa
 * do limiar.
 *
 * @param workspaceId espaço de trabalho ao qual a busca é restrita.
 * @param termo o que a pessoa digitou, já sem o "#" decorativo.
 * @param limite teto de linhas; a ordenação é a do servidor e deve ser mantida.
 */
export async function buscarChamados(workspaceId: string, termo: string, limite: number): Promise<ChamadoEncontrado[]> {
  const q = termo.trim().replace(/^#/, "");
  if (!q) return [];

  const chave = chaveDoChamado(q);
  const chaveBranch = chave
    ? Prisma.sql`
        UNION
        SELECT i.id FROM issues i
          JOIN projects p ON p.id = i.project_id
         WHERE i.deleted_at IS NULL AND i.is_draft = false
           AND upper(p.identifier) = upper(${chave.identificador})
           AND i.sequence_id = ${chave.sequencial}`
    : Prisma.empty;
  const chaveBoost = chave
    ? Prisma.sql`+ (CASE WHEN upper(p.identifier) = upper(${chave.identificador}) AND i.sequence_id = ${chave.sequencial} THEN 100 ELSE 0 END)`
    : Prisma.empty;

  // "500/2026", "500 2026" e "5002026" procuram o "500-2026" que está gravado.
  const grafiaCanonica = grafiaCanonicaDoNumeroLegado(q);
  const varianteLegadaBranch = grafiaCanonica
    ? Prisma.sql`
        UNION
        SELECT i.id FROM issues i
         WHERE i.deleted_at IS NULL AND i.is_draft = false
           AND i.legacy_ticket_number ILIKE '%' || ${grafiaCanonica} || '%'`
    : Prisma.empty;
  const varianteLegadaBoost = grafiaCanonica
    ? Prisma.sql`+ (CASE WHEN i.legacy_ticket_number = ${grafiaCanonica} THEN 100 ELSE 0 END)`
    : Prisma.empty;

  const ftsDoc = Prisma.raw(ISSUE_FTS_DOC_I);
  const titleDoc = Prisma.raw(ISSUE_TITLE_DOC_I);
  const commentDoc = Prisma.raw(COMMENT_FTS_DOC_C);
  const cfg = Prisma.raw(`'${PT_FTS_CONFIG}'`);

  return prisma.$queryRaw<ChamadoEncontrado[]>(Prisma.sql`
      WITH achados AS (
        SELECT i.id FROM issues i
         WHERE i.deleted_at IS NULL AND i.is_draft = false
           AND ${ftsDoc} @@ websearch_to_tsquery(${cfg}, ${q})
        UNION
        SELECT i.id FROM issues i
         WHERE i.deleted_at IS NULL AND i.is_draft = false
           AND (i.name % ${q} OR i.name ILIKE '%' || ${q} || '%')
        UNION
        SELECT i.id FROM issues i
         WHERE i.deleted_at IS NULL AND i.is_draft = false
           AND i.legacy_ticket_number ILIKE '%' || ${q} || '%'
        UNION
        SELECT c.issue_id FROM issue_comments c
         WHERE c.deleted_at IS NULL
           AND ${commentDoc} @@ websearch_to_tsquery(${cfg}, ${q})
        ${varianteLegadaBranch}
        ${chaveBranch}
      )
      SELECT i.id, i.name, i.sequence_id, i.priority, i.legacy_ticket_number,
             s."group" AS state_group, s.name AS state_name,
             p.id AS project_id, p.identifier AS project_identifier, p.name AS project_name
      FROM issues i
      JOIN achados a ON a.id = i.id
      LEFT JOIN states s ON s.id = i.state_id
      LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.workspace_id = ${workspaceId}::uuid
        AND i.deleted_at IS NULL
        AND i.is_draft = false
      ORDER BY (
        (CASE WHEN i.legacy_ticket_number = ${q} THEN 100 ELSE 0 END)
        + ts_rank(${titleDoc}, websearch_to_tsquery(${cfg}, ${q})) * 4
        + similarity(i.name, ${q}) * 2
        + (CASE WHEN i.name ILIKE '%' || ${q} || '%' THEN 1 ELSE 0 END)
        + similarity(coalesce(i.legacy_ticket_number,''), ${q})
        ${varianteLegadaBoost}
        ${chaveBoost}
      ) DESC, i.updated_at DESC
      LIMIT ${limite}
    `);
}

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
  // Resolução de "ESIC-150" → chamado (rota /browse/ e busca por identificador).
  // Sem ele, cada link de notificação aberto varre a tabela inteira de chamados.
  `CREATE INDEX IF NOT EXISTS idx_issues_project_sequence ON issues (project_id, sequence_id)`,
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
