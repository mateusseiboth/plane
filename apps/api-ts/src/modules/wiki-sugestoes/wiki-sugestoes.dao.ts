/**
 * DAO das sugestões da wiki: só acesso a dados. A consulta em si (termos,
 * palavras vazias) é montada em `wiki-sugestoes.rules.ts`.
 *
 * O recorte de quem vê o quê é uma estratégia própria (`RecorteDasPaginas`),
 * separada do `findPaginas` de `@utils/search`, que continua valendo para a
 * navegação da wiki. O documento pesquisável é `PAGE_FTS_DOC_P`, idêntico ao
 * do índice `idx_pages_fts`, para o índice valer.
 */
import prisma from "@db";
import { Prisma } from "@prisma/client";
import { PAGE_FTS_DOC_P, PT_FTS_CONFIG } from "@utils/search";

/** Quem pergunta: o espaço, a pessoa e se ela lê a wiki do espaço (`wiki.view`). */
export type AlcanceDasPaginas = {
  workspaceId: string;
  userId: string;
  includeWiki: boolean;
};

/**
 * Estratégia de recorte: decide, sobre as páginas já agrupadas (alias `p`, com
 * `pp` = vínculos e `pr` = sistemas vivos), quais a pessoa enxerga.
 */
export type RecorteDasPaginas = (alcance: AlcanceDasPaginas) => Prisma.Sql;

/**
 * Recorte de quem abre solicitação (`intake.create`). O Atendimento quase nunca
 * participa de sistema, e é a wiki de cada sistema que responde ao problema do
 * cliente: página de QUALQUER sistema do espaço entra, sem exigir vínculo, desde
 * que pública. Privada só para o dono; excluída e arquivada nunca (filtro comum,
 * em `buildPaginasVisiveis`). Página sem sistema segue a regra da wiki.
 */
export const recorteDaSolicitacao: RecorteDasPaginas = (alcance) => Prisma.sql`
  (p.access = 0 OR p.owned_by_id = ${alcance.userId}::uuid)
  AND ((${alcance.includeWiki}::boolean AND count(pp.id) = 0) OR bool_or(pr.id IS NOT NULL))`;

export type PaginaParecida = { id: string; name: string; trecho: string; project_ids: string[] };

export type PaginaDoContexto = { id: string; name: string; trecho: string };

/** Começo do texto de cada página que vai para a IA. */
const TAMANHO_DO_TRECHO_PARA_IA = 1500;

/** Trecho em texto puro, em volta dos termos achados. */
const OPCOES_DO_TRECHO = 'StartSel="", StopSel="", MaxWords=35, MinWords=15, MaxFragments=2, FragmentDelimiter=" … "';

const cfg = Prisma.raw(`'${PT_FTS_CONFIG}'`);
const ftsDoc = Prisma.raw(PAGE_FTS_DOC_P);

/**
 * As páginas vivas do espaço que o recorte deixa ver, com os sistemas vivos de
 * cada uma (alias `v`).
 */
const buildPaginasVisiveis = (alcance: AlcanceDasPaginas, recorte: RecorteDasPaginas, filtro: Prisma.Sql) => Prisma.sql`
  SELECT p.id, p.name, p.description_stripped, p.updated_at,
         coalesce(array_agg(pr.id::text) FILTER (WHERE pr.id IS NOT NULL), '{}') AS project_ids
    FROM pages p
    LEFT JOIN project_pages pp ON pp.page_id = p.id
    LEFT JOIN projects pr ON pr.id = pp.project_id AND pr.deleted_at IS NULL
   WHERE p.workspace_id = ${alcance.workspaceId}::uuid
     AND p.deleted_at IS NULL AND p.archived_at IS NULL
     AND ${filtro}
   GROUP BY p.id
  HAVING ${recorte(alcance)}`;

/**
 * Páginas que casam com a consulta, das mais parecidas para as menos: as do
 * sistema escolhido primeiro, depois `ts_rank` (título vale mais que corpo).
 * O trecho (`ts_headline`) só é montado para as que voltam.
 */
export const findPaginasParecidas = (args: {
  alcance: AlcanceDasPaginas;
  recorte: RecorteDasPaginas;
  consulta: string;
  projectIdPreferido: string | null;
  limite: number;
}): Promise<PaginaParecida[]> => {
  const { alcance, recorte, consulta, projectIdPreferido, limite } = args;
  const tsquery = Prisma.sql`websearch_to_tsquery(${cfg}, ${consulta})`;
  const visiveis = buildPaginasVisiveis(alcance, recorte, Prisma.sql`${ftsDoc} @@ ${tsquery}`);
  return prisma.$queryRaw<PaginaParecida[]>(Prisma.sql`
    WITH visiveis AS (${visiveis}),
    melhores AS (
      SELECT v.*,
             (${projectIdPreferido}::text IS NOT NULL AND ${projectIdPreferido}::text = ANY(v.project_ids)) AS do_sistema,
             ts_rank(to_tsvector(${cfg}, coalesce(v.name,'')), ${tsquery}) * 4
               + ts_rank(to_tsvector(${cfg}, coalesce(v.name,'') || ' ' || coalesce(v.description_stripped,'')), ${tsquery})
               AS relevancia
        FROM visiveis v
       ORDER BY do_sistema DESC, relevancia DESC, v.updated_at DESC
       LIMIT ${limite}
    )
    SELECT m.id, m.name, m.project_ids,
           ts_headline(${cfg}, coalesce(m.description_stripped, ''), ${tsquery}, ${OPCOES_DO_TRECHO}) AS trecho
      FROM melhores m
     ORDER BY m.do_sistema DESC, m.relevancia DESC, m.updated_at DESC`);
};

/** As páginas escolhidas que a pessoa enxerga, com o começo do texto, na ordem pedida. */
export const findPaginasDoContexto = async (args: {
  alcance: AlcanceDasPaginas;
  recorte: RecorteDasPaginas;
  ids: string[];
}): Promise<PaginaDoContexto[]> => {
  const { alcance, recorte, ids } = args;
  if (!ids.length) return [];
  const visiveis = buildPaginasVisiveis(alcance, recorte, Prisma.sql`p.id = ANY(${ids}::uuid[])`);
  const linhas = await prisma.$queryRaw<PaginaDoContexto[]>(Prisma.sql`
    SELECT v.id, v.name, left(coalesce(v.description_stripped, ''), ${TAMANHO_DO_TRECHO_PARA_IA}) AS trecho
      FROM (${visiveis}) v`);
  return ids.flatMap((id) => linhas.filter((linha) => linha.id === id));
};
