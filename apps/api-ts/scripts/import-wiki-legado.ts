/**
 * Importa para a WIKI do espaço o que a intranet legada guardava fora dos chamados:
 *
 *   1. Disco virtual: os arquivos de DISCO_DIR viram a página "Processos", com
 *      um bloco de anexo por arquivo. O título de cada anexo vem do cadastro
 *      `arquivos` do MySQL (quando o nome casa); sem MySQL, do nome do arquivo.
 *   2. FAQ do SAC (`faq_categorias` > `faq_subcategorias` > `faq_questoes`):
 *      uma página por categoria, filha da página "FAQ". Categoria sem pergunta
 *      não vira página.
 *
 * Idempotente: páginas são achadas por (external_source, external_id) e
 * reescritas; anexos, por `attributes.legacy_path` dentro da página. Rodar de
 * novo atualiza o conteúdo sem duplicar nada.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... WORKSPACE_SLUG=quality \
 *   bun run scripts/import-wiki-legado.ts
 *
 * Opções (env):
 *   DISCO_DIR=/caminho/arquivos_disco   pasta dos arquivos do disco virtual
 *   IMPORT_OWNER_EMAIL=...              dona das páginas (padrão: o admin mais antigo do espaço)
 *   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASS / MYSQL_DB (como os demais scripts do SAC)
 *   DRY_RUN=true        só relata
 *   SKIP_DISCO=true / SKIP_FAQ=true
 */
import { readdir, stat } from "fs/promises";
import path from "path";
import prisma from "@db";
import { saveAsset } from "@utils/storage";
import {
  buildFaqCategoriaHtml,
  buildProcessosHtml,
  findTituloDoArquivo,
  normalizeNomeDeArquivo,
  stripHtml,
} from "@utils/wiki-legado";
import type { ArquivoDoDisco, SubcategoriaDoFaq } from "@utils/wiki-legado";

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST ?? "10.1.2.32",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "developer",
  password: process.env.MYSQL_PASS ?? "qualitydev",
  database: process.env.MYSQL_DB ?? "quality_site_dev",
  ssl: false as const,
};

const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const DISCO_DIR = process.env.DISCO_DIR ?? "/home/mateusseiboth/dev/php/siteintranet/intranet/arquivos_disco";
const DRY_RUN = process.env.DRY_RUN === "true";
const SKIP_DISCO = process.env.SKIP_DISCO === "true";
const SKIP_FAQ = process.env.SKIP_FAQ === "true";

/** Marca das páginas criadas por este script (dedupe em nova execução). */
const EXTERNAL_SOURCE = "intranet_legado";
/** `file_assets.entity_type` de conteúdo de página (o mesmo do upload do editor). */
const ENTITY_TYPE_PAGE = 3;

type MySqlConn = { query: (sql: string) => Promise<[unknown, unknown]>; end: () => Promise<void> };
type Contexto = { workspaceId: string; ownerId: string; mysql: MySqlConn | null };

const log = (mensagem: string) => console.log(`[wiki-legado] ${mensagem}`);

async function connectMysql(): Promise<MySqlConn | null> {
  try {
    const mysql2 = await import("mysql2/promise");
    // `as any`: os overloads de ConnectionOptions do mysql2 não aceitam `ssl: false`.
    return (await mysql2.createConnection({ ...MYSQL_CONFIG } as any)) as unknown as MySqlConn;
  } catch (erro) {
    log(`MySQL indisponível (${(erro as Error).message}); o FAQ fica de fora e os títulos saem do nome do arquivo.`);
    return null;
  }
}

async function queryRows<T>(mysql: MySqlConn, sql: string): Promise<T[]> {
  const [rows] = await mysql.query(sql);
  return rows as T[];
}

/**
 * Cria ou reescreve a página. O binário Yjs é zerado de propósito: o `live`
 * remonta o documento a partir do HTML na próxima abertura.
 */
async function upsertPagina(
  ctx: Contexto,
  dados: { externalId: string; name: string; html: string; parentId: string | null; sortOrder: number }
): Promise<string> {
  const existente = await prisma.page.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      externalSource: EXTERNAL_SOURCE,
      externalId: dados.externalId,
      deletedAt: null,
    },
    select: { id: true },
  });
  const conteudo = {
    name: dados.name,
    descriptionHtml: dados.html,
    descriptionStripped: stripHtml(dados.html),
    descriptionBinary: null,
    parentId: dados.parentId,
    sortOrder: dados.sortOrder,
    updatedById: ctx.ownerId,
  };
  if (DRY_RUN) return existente?.id ?? `dry-${dados.externalId}`;
  if (existente) {
    await prisma.page.update({ where: { id: existente.id }, data: conteudo });
    return existente.id;
  }
  const criada = await prisma.page.create({
    data: {
      ...conteudo,
      workspaceId: ctx.workspaceId,
      ownedById: ctx.ownerId,
      createdById: ctx.ownerId,
      externalSource: EXTERNAL_SOURCE,
      externalId: dados.externalId,
    },
    select: { id: true },
  });
  return criada.id;
}

/** Nome cadastrado de cada arquivo do disco virtual, pela chave normalizada do caminho. */
async function readCatalogoDoDisco(mysql: MySqlConn | null): Promise<Map<string, string>> {
  if (!mysql) return new Map();
  const linhas = await queryRows<{ arquivo_nome: string; caminho: string }>(
    mysql,
    "SELECT arquivo_nome, caminho FROM arquivos WHERE caminho IS NOT NULL"
  );
  return new Map(linhas.map((l) => [normalizeNomeDeArquivo(l.caminho), l.arquivo_nome.trim()]));
}

/** Anexo do arquivo na página: reaproveita o que já foi importado, senão grava. */
async function saveAnexo(
  ctx: Contexto,
  pageId: string,
  arquivo: string
): Promise<{ assetId: string; tamanho: number; mimeType: string }> {
  const caminho = path.join(DISCO_DIR, arquivo);
  const blob = Bun.file(caminho);
  const mimeType = blob.type.split(";")[0] || "application/octet-stream";
  const tamanho = (await stat(caminho)).size;
  const legacyPath = `arquivos_disco/${arquivo}`;
  if (DRY_RUN) return { assetId: `dry-${arquivo}`, tamanho, mimeType };

  const existente = await prisma.fileAsset.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      entityId: pageId,
      isDeleted: false,
      attributes: { path: ["legacy_path"], equals: legacyPath },
    },
    select: { id: true },
  });
  if (existente) return { assetId: existente.id, tamanho, mimeType };

  const asset = await prisma.fileAsset.create({
    data: {
      workspaceId: ctx.workspaceId,
      entityType: ENTITY_TYPE_PAGE,
      entityId: pageId,
      asset: `ws/${ctx.workspaceId}/wiki/${arquivo}`,
      size: tamanho,
      mimeType,
      isUploaded: true,
      attributes: {
        name: arquivo,
        type: mimeType,
        size: tamanho,
        entity_type: "PAGE_DESCRIPTION",
        legacy_path: legacyPath,
      },
    },
  });
  // A chave no armazenamento é o id do asset (ver `serveAsset`).
  await saveAsset(asset.id, blob);
  return { assetId: asset.id, tamanho, mimeType };
}

async function importDisco(ctx: Contexto): Promise<void> {
  const entradas = await readdir(DISCO_DIR, { withFileTypes: true });
  const arquivos = entradas.filter((e) => e.isFile()).map((e) => e.name);
  log(`Disco virtual: ${arquivos.length} arquivo(s) em ${DISCO_DIR}`);
  const catalogo = await readCatalogoDoDisco(ctx.mysql);

  const pageId = await upsertPagina(ctx, {
    externalId: "processos",
    name: "Processos",
    html: "<p></p>",
    parentId: null,
    sortOrder: 10_000,
  });
  const anexos: ArquivoDoDisco[] = [];
  for (const arquivo of arquivos) {
    const salvo = await saveAnexo(ctx, pageId, arquivo);
    anexos.push({ titulo: findTituloDoArquivo(catalogo, arquivo), nome: arquivo, ...salvo });
    log(`  anexo: ${arquivo}`);
  }
  await upsertPagina(ctx, {
    externalId: "processos",
    name: "Processos",
    html: buildProcessosHtml(anexos),
    parentId: null,
    sortOrder: 10_000,
  });
  log(`  página "Processos" com ${anexos.length} anexo(s)`);
}

type LinhaDoFaq = {
  categoria_id: number;
  categoria: string;
  subcategoria_id: number;
  subcategoria: string;
  pergunta: string | null;
  resposta: string | null;
  tags: string | null;
  sistema: string | null;
};

/** Agrupa as linhas do FAQ em categoria > subcategoria > perguntas. */
function groupFaq(linhas: LinhaDoFaq[]) {
  const categorias = new Map<number, { nome: string; subcategorias: Map<number, SubcategoriaDoFaq> }>();
  for (const l of linhas) {
    const categoria = categorias.get(l.categoria_id) ?? { nome: l.categoria.trim(), subcategorias: new Map() };
    categorias.set(l.categoria_id, categoria);
    const sub = categoria.subcategorias.get(l.subcategoria_id) ?? { nome: l.subcategoria.trim(), perguntas: [] };
    categoria.subcategorias.set(l.subcategoria_id, sub);
    if (l.pergunta?.trim()) {
      sub.perguntas.push({ pergunta: l.pergunta.trim(), resposta: l.resposta ?? "", sistema: l.sistema, tags: l.tags });
    }
  }
  return categorias;
}

async function importFaq(ctx: Contexto): Promise<void> {
  if (!ctx.mysql) return;
  const linhas = await queryRows<LinhaDoFaq>(
    ctx.mysql,
    `SELECT c.faq_categorias_id AS categoria_id, c.faq_categorias_nome AS categoria,
            s.faq_subcategorias_id AS subcategoria_id, s.faq_subcategorias_nome AS subcategoria,
            q.faq_questoes_perguntas AS pergunta, q.faq_questoes_respostas AS resposta,
            q.faq_questoes_tags AS tags, si.sistemas_nome AS sistema
       FROM faq_categorias c
       JOIN faq_subcategorias s ON s.faq_subcategorias_categorias_id = c.faq_categorias_id
       LEFT JOIN faq_questoes q ON q.faq_questoes_subcategorias_id = s.faq_subcategorias_id
       LEFT JOIN sistemas si ON si.sistemas_id = q.faq_questoes_sistemas_id
      ORDER BY c.faq_categorias_nome, s.faq_subcategorias_nome, q.faq_questoes_id`
  );
  const categorias = [...groupFaq(linhas).entries()];
  const comPerguntas = categorias.filter(([, c]) => [...c.subcategorias.values()].some((s) => s.perguntas.length));
  log(`FAQ: ${categorias.length} categoria(s), ${comPerguntas.length} com pergunta(s)`);
  if (!comPerguntas.length) return;

  const faqId = await upsertPagina(ctx, {
    externalId: "faq",
    name: "FAQ",
    html: "<p>Perguntas frequentes trazidas do SAC, uma página por categoria.</p>",
    parentId: null,
    sortOrder: 20_000,
  });
  for (const [ordem, [id, categoria]] of comPerguntas.entries()) {
    const html = buildFaqCategoriaHtml([...categoria.subcategorias.values()]);
    await upsertPagina(ctx, {
      externalId: `faq-categoria-${id}`,
      name: categoria.nome,
      html,
      parentId: faqId,
      sortOrder: (ordem + 1) * 10_000,
    });
    log(`  página "${categoria.nome}"`);
  }
}

/** Dona das páginas importadas: a pessoa informada ou o admin mais antigo do espaço. */
async function findDonoDaImportacao(workspaceId: string): Promise<string> {
  const email = process.env.IMPORT_OWNER_EMAIL;
  if (email) {
    const usuario = await prisma.user.findFirst({ where: { email }, select: { id: true } });
    if (!usuario) throw new Error(`Usuário ${email} não encontrado.`);
    return usuario.id;
  }
  const admin = await prisma.workspaceMember.findFirst({
    where: { workspaceId, role: { gte: 20 }, isActive: true, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { memberId: true },
  });
  if (!admin) throw new Error("O espaço não tem administrador; informe IMPORT_OWNER_EMAIL.");
  return admin.memberId;
}

async function main() {
  log(`Início${DRY_RUN ? " (DRY RUN)" : ""}: espaço "${WORKSPACE_SLUG}"`);
  const ws = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG, deletedAt: null } });
  if (!ws) throw new Error(`Espaço "${WORKSPACE_SLUG}" não encontrado.`);
  const ctx: Contexto = { workspaceId: ws.id, ownerId: await findDonoDaImportacao(ws.id), mysql: await connectMysql() };
  try {
    if (!SKIP_DISCO) await importDisco(ctx);
    if (!SKIP_FAQ) await importFaq(ctx);
  } finally {
    await ctx.mysql?.end();
    await prisma.$disconnect();
  }
  log("Concluído.");
}

await main();
