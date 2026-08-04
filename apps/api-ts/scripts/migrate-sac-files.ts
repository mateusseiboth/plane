/**
 * Migração de ARQUIVOS do SAC legado (MySQL) → anexos do Plane.
 *
 * Complementa `migrate-sac.ts`, que migra chamados/mensagens/visitas mas NÃO
 * traz nenhum arquivo. Aqui vêm:
 *   1. anexos das mensagens  (mensagens.mensagens_caminho_arquivo)  → issue_attachments
 *   2. arquivo da visita     (visita.visita_arquivo)                → file_assets (entidade = visita)
 *   3. disco virtual         (arquivos.caminho)                     → file_assets (workspace)
 *
 * O binário e o registro são migrados em etapas independentes, porque o
 * repositório de arquivos do legado costuma estar em outra máquina/rede:
 *
 *   - SEM fonte configurada: cria o registro do anexo com o caminho legado em
 *     `attributes.legacy_path` e `attributes.pending_import = true`. Nenhum dado
 *     de catálogo se perde e o download pode ser feito depois.
 *   - COM fonte configurada (LEGACY_FILES_BASE ou LEGACY_FILES_DIR): baixa o
 *     binário, grava no storage do Plane (S3 ou disco, conforme a instância) e
 *     marca o anexo como importado.
 *
 * Rodar duas vezes é seguro: os registros são deduplicados por
 * (externalSource, externalId) e um segundo passe apenas completa o que ficou
 * pendente.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... \
 *   WORKSPACE_SLUG=quality \
 *   LEGACY_FILES_BASE=http://servidor-legado            # ou
 *   LEGACY_FILES_DIR=/mnt/sac                           # diretório montado
 *   bun run scripts/migrate-sac-files.ts
 *
 * Opções (env):
 *   DRY_RUN=true        - não escreve nada
 *   BATCH_SIZE=200      - registros por lote
 *   LIMIT_RECORDS=0     - processa no máximo N anexos de mensagens (0 = todos)
 *   PENDING_ONLY=true   - só baixa binários de anexos já registrados
 *   SKIP_MESSAGES / SKIP_VISITS / SKIP_DISCO = true
 *   FETCH_TIMEOUT_MS=20000
 */

import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {readFile} from "fs/promises";
import path from "path";
import {Pool as PgPool} from "pg";
import {saveAsset} from "../src/utils/storage";

// ── Config ────────────────────────────────────────────────────────────────────

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST ?? "10.1.2.32",
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? "developer",
  password: process.env.MYSQL_PASS ?? "qualitydev",
  database: process.env.MYSQL_DB ?? "quality_site_dev",
  ssl: false as const,
};

const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 200);
const LIMIT_RECORDS = Number(process.env.LIMIT_RECORDS ?? 0);
const PENDING_ONLY = process.env.PENDING_ONLY === "true";
const SKIP_MESSAGES = process.env.SKIP_MESSAGES === "true";
const SKIP_VISITS = process.env.SKIP_VISITS === "true";
const SKIP_DISCO = process.env.SKIP_DISCO === "true";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 20000);

const FILES_BASE = (process.env.LEGACY_FILES_BASE ?? "").replace(/\/$/, "");
const FILES_DIR = process.env.LEGACY_FILES_DIR ?? "";
const HAS_SOURCE = Boolean(FILES_BASE || FILES_DIR);

const SOURCE = "sac_migration_file";
const ENTITY_TYPE_ISSUE = 2;
const ENTITY_TYPE_WORKSPACE = 0;

const pgPool = new PgPool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pgPool)});

const stats = {
  registered: 0,
  downloaded: 0,
  pending: 0,
  skipped: 0,
  failed: 0,
};

function log(msg: string) {
  console.log(`[sac-files] ${msg}`);
}

// ── Tipos de arquivo ──────────────────────────────────────────────────────────

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  xml: "application/xml",
  json: "application/json",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
};

export function mimeFor(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Nome do arquivo a partir do caminho legado (sempre com separador "/"). */
export function fileNameFor(legacyPath: string): string {
  return legacyPath.split("/").filter(Boolean).pop() ?? "arquivo";
}

/** Chave de storage determinística — reprocessar não duplica objeto. */
export function assetKeyFor(scope: string, ownerId: string, legacyId: string | number, legacyPath: string): string {
  const safeName = fileNameFor(legacyPath).replace(/[^A-Za-z0-9._-]/g, "_");
  return `${scope}/${ownerId}/legacy/${legacyId}-${safeName}`;
}

// ── Leitura do arquivo legado ─────────────────────────────────────────────────

async function readLegacyFile(legacyPath: string): Promise<Blob | null> {
  const relative = legacyPath.replace(/^\/+/, "");
  if (FILES_DIR) {
    try {
      const buffer = await readFile(path.join(FILES_DIR, relative));
      return new Blob([buffer], {type: mimeFor(relative)});
    } catch {
      return null;
    }
  }
  if (!FILES_BASE) return null;
  try {
    const res = await fetch(`${FILES_BASE}/${encodeURI(relative)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    // Servidores mal configurados devolvem uma página HTML com 200 no lugar do
    // arquivo; um "arquivo" HTML minúsculo é quase sempre isso.
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") && !relative.toLowerCase().endsWith(".html")) return null;
    return new Blob([buffer], {type: mimeFor(relative)});
  } catch {
    return null;
  }
}

/** Baixa e grava o binário; devolve o tamanho ou null quando indisponível. */
async function importBinary(assetKey: string, legacyPath: string): Promise<number | null> {
  if (!HAS_SOURCE) return null;
  const blob = await readLegacyFile(legacyPath);
  if (!blob || blob.size === 0) return null;
  if (!DRY_RUN) await saveAsset(assetKey, blob);
  return blob.size;
}

// ── 1. Anexos das mensagens → issue_attachments ───────────────────────────────

type MensagemArquivo = {
  mensagens_id: number;
  mensagens_chamados_id: number;
  mensagens_usuarios_id: number | null;
  mensagens_data: Date | null;
  mensagens_caminho_arquivo: string;
};

async function migrateMessageAttachments(conn: any, chamadoMap: Map<number, {id: string; projectId: string; workspaceId: string}>) {
  log("\n📎  Anexos de mensagens → issue_attachments");
  const [countRow] = await conn.query(
    `SELECT COUNT(*) AS total FROM mensagens
     WHERE mensagens_status = 1 AND mensagens_caminho_arquivo IS NOT NULL AND mensagens_caminho_arquivo <> ''`
  );
  log(`  Total no legado: ${countRow[0].total}`);

  let lastId = 0;
  let processed = 0;
  while (true) {
    const [rows] = (await conn.query(
      `SELECT mensagens_id, mensagens_chamados_id, mensagens_usuarios_id, mensagens_data, mensagens_caminho_arquivo
       FROM mensagens
       WHERE mensagens_status = 1 AND mensagens_caminho_arquivo IS NOT NULL AND mensagens_caminho_arquivo <> ''
         AND mensagens_id > ?
       ORDER BY mensagens_id ASC
       LIMIT ${BATCH_SIZE}`,
      [lastId]
    )) as [MensagemArquivo[], unknown];
    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = Math.max(lastId, row.mensagens_id);
      await importMessageAttachment(row, chamadoMap);
      processed++;
      if (LIMIT_RECORDS > 0 && processed >= LIMIT_RECORDS) break;
    }

    if (processed % 1000 === 0 || rows.length < BATCH_SIZE) log(`  Processados ${processed}`);
    if (rows.length < BATCH_SIZE) break;
    if (LIMIT_RECORDS > 0 && processed >= LIMIT_RECORDS) break;
  }
  log(`  ✅  ${processed} anexos de mensagens avaliados`);
}

async function importMessageAttachment(
  row: MensagemArquivo,
  chamadoMap: Map<number, {id: string; projectId: string; workspaceId: string}>
) {
  const issue = chamadoMap.get(row.mensagens_chamados_id);
  if (!issue) {
    stats.skipped++;
    return;
  }

  const legacyPath = row.mensagens_caminho_arquivo;
  const externalId = String(row.mensagens_id);
  const existing = await prisma.issueAttachment.findFirst({
    where: {externalSource: SOURCE, externalId, deletedAt: null},
  });

  // Já registrado e já importado → nada a fazer.
  if (existing && (existing.attributes as any)?.pending_import !== true) {
    stats.skipped++;
    return;
  }
  if (!existing && PENDING_ONLY) {
    stats.skipped++;
    return;
  }

  const assetKey = assetKeyFor("issues", issue.id, row.mensagens_id, legacyPath);
  const name = fileNameFor(legacyPath);
  const type = mimeFor(name);
  const size = await importBinary(assetKey, legacyPath);
  const attributes = {
    name,
    type,
    size: size ?? 0,
    legacy_path: legacyPath,
    legacy_message_id: row.mensagens_id,
    pending_import: size === null,
  };

  if (DRY_RUN) {
    size === null ? stats.pending++ : stats.downloaded++;
    return;
  }

  if (existing) {
    await prisma.issueAttachment.update({where: {id: existing.id}, data: {attributes}});
  } else {
    await prisma.issueAttachment.create({
      data: {
        issueId: issue.id,
        workspaceId: issue.workspaceId,
        projectId: issue.projectId,
        asset: assetKey,
        attributes,
        externalSource: SOURCE,
        externalId,
        createdAt: row.mensagens_data ?? new Date(),
      },
    });
    stats.registered++;
  }

  if (size === null) {
    stats.pending++;
    return;
  }
  await upsertFileAsset({
    assetKey,
    workspaceId: issue.workspaceId,
    projectId: issue.projectId,
    entityType: ENTITY_TYPE_ISSUE,
    entityId: issue.id,
    size,
    mimeType: type,
    attributes,
  });
  stats.downloaded++;
}

// ── file_assets ───────────────────────────────────────────────────────────────

async function upsertFileAsset(args: {
  assetKey: string;
  workspaceId: string;
  projectId?: string | null;
  entityType: number;
  entityId: string | null;
  size: number;
  mimeType: string;
  attributes: Record<string, unknown>;
}) {
  if (DRY_RUN) return;
  const existing = await prisma.fileAsset.findFirst({where: {asset: args.assetKey}});
  const data = {
    workspaceId: args.workspaceId,
    projectId: args.projectId ?? null,
    entityType: args.entityType,
    entityId: args.entityId,
    asset: args.assetKey,
    size: args.size,
    mimeType: args.mimeType,
    isUploaded: true,
    attributes: args.attributes as any,
  };
  if (existing) await prisma.fileAsset.update({where: {id: existing.id}, data});
  else await prisma.fileAsset.create({data});
}

// ── 2. Arquivo da visita ──────────────────────────────────────────────────────

async function migrateVisitFiles(conn: any, workspaceId: string) {
  log("\n🚗  Arquivos de visitas → file_assets");
  const [rows] = (await conn.query(
    `SELECT visita_id, visita_arquivo FROM visita
     WHERE visita_status = 1 AND visita_arquivo IS NOT NULL AND visita_arquivo <> ''`
  )) as [Array<{visita_id: number; visita_arquivo: string}>, unknown];
  log(`  Encontrados: ${rows.length}`);

  for (const row of rows) {
    const visit = await prisma.technicalVisit.findFirst({
      where: {workspaceId, legacyId: row.visita_id, deletedAt: null},
      select: {id: true},
    });
    if (!visit) {
      stats.skipped++;
      continue;
    }
    const assetKey = assetKeyFor("visits", visit.id, row.visita_id, row.visita_arquivo);
    const name = fileNameFor(row.visita_arquivo);
    const type = mimeFor(name);
    const size = await importBinary(assetKey, row.visita_arquivo);
    const attributes = {
      name,
      type,
      size: size ?? 0,
      legacy_path: row.visita_arquivo,
      legacy_visit_id: row.visita_id,
      category: "visita",
      pending_import: size === null,
    };
    await upsertFileAsset({
      assetKey,
      workspaceId,
      entityType: ENTITY_TYPE_WORKSPACE,
      entityId: visit.id,
      size: size ?? 0,
      mimeType: type,
      attributes,
    });
    size === null ? stats.pending++ : stats.downloaded++;
    stats.registered++;
  }
  log(`  ✅  ${rows.length} arquivos de visita avaliados`);
}

// ── 3. Disco virtual ──────────────────────────────────────────────────────────

async function migrateDiscoVirtual(conn: any, workspaceId: string) {
  log("\n🗄️   Disco virtual → file_assets");
  const [rows] = (await conn.query(
    `SELECT a.arquivos_id, a.arquivo_nome, a.caminho, a.data_cadastro, a.data_ata,
            d.discovirtual_pasta AS pasta
     FROM arquivos a
     LEFT JOIN discovirtual d ON d.discovirtual_id = a.arquivos_discovirtual_id
     WHERE a.status = 1`
  )) as [Array<any>, unknown];
  log(`  Encontrados: ${rows.length}`);

  for (const row of rows) {
    const assetKey = assetKeyFor("disco", workspaceId, row.arquivos_id, row.caminho);
    const name = fileNameFor(row.caminho);
    const type = mimeFor(name);
    const size = await importBinary(assetKey, row.caminho);
    const attributes = {
      name,
      title: row.arquivo_nome,
      type,
      size: size ?? 0,
      legacy_path: row.caminho,
      legacy_file_id: row.arquivos_id,
      folder: row.pasta ?? null,
      meeting_date: row.data_ata ?? null,
      category: "disco_virtual",
      pending_import: size === null,
    };
    await upsertFileAsset({
      assetKey,
      workspaceId,
      entityType: ENTITY_TYPE_WORKSPACE,
      entityId: null,
      size: size ?? 0,
      mimeType: type,
      attributes,
    });
    size === null ? stats.pending++ : stats.downloaded++;
    stats.registered++;
  }
  log(`  ✅  ${rows.length} arquivos do disco virtual avaliados`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`Iniciando migração de arquivos${DRY_RUN ? " (DRY RUN)" : ""}`);
  log(`MySQL: ${MYSQL_CONFIG.database}@${MYSQL_CONFIG.host}`);
  log(
    HAS_SOURCE
      ? `Fonte dos binários: ${FILES_DIR ? `diretório ${FILES_DIR}` : `HTTP ${FILES_BASE}`}`
      : "⚠️  Nenhuma fonte de binários configurada (LEGACY_FILES_BASE / LEGACY_FILES_DIR): " +
          "os anexos serão registrados como pendentes, com o caminho legado preservado."
  );

  const workspace = await prisma.workspace.findFirst({where: {slug: WORKSPACE_SLUG, deletedAt: null}});
  if (!workspace) {
    log(`❌  Workspace '${WORKSPACE_SLUG}' não encontrado.`);
    process.exit(1);
  }

  const mysql2 = await import("mysql2/promise");
  // `as any`: os overloads de ConnectionOptions do mysql2 não aceitam `ssl: false`
  // literal, embora o driver aceite (mesmo padrão de migrate-sac.ts).
  const conn = await mysql2.createConnection({...MYSQL_CONFIG} as any);
  log("✅  MySQL conectado");

  // chamado legado → issue migrada
  const issues = await prisma.issue.findMany({
    where: {workspaceId: workspace.id, externalSource: "sac_migration", deletedAt: null},
    select: {id: true, projectId: true, workspaceId: true, externalId: true},
  });
  const chamadoMap = new Map<number, {id: string; projectId: string; workspaceId: string}>();
  for (const issue of issues) {
    if (issue.externalId) chamadoMap.set(Number(issue.externalId), issue);
  }
  log(`✅  ${chamadoMap.size} chamados migrados localizados`);
  if (chamadoMap.size === 0) log("⚠️  Rode scripts/migrate-sac.ts antes: sem chamados não há onde anexar.");

  if (!SKIP_MESSAGES) await migrateMessageAttachments(conn, chamadoMap);
  if (!SKIP_VISITS) await migrateVisitFiles(conn, workspace.id);
  if (!SKIP_DISCO) await migrateDiscoVirtual(conn, workspace.id);

  await conn.end();
  await prisma.$disconnect();
  await pgPool.end();

  log("\n══════════════════════════════════════════════════");
  log("  Migração de arquivos concluída");
  log(`  Registrados:        ${stats.registered}`);
  log(`  Binários baixados:  ${stats.downloaded}`);
  log(`  Pendentes:          ${stats.pending}`);
  log(`  Ignorados:          ${stats.skipped}`);
  log(`  Falhas:             ${stats.failed}`);
  if (!HAS_SOURCE && stats.pending > 0) {
    log("");
    log("  Para baixar os binários depois, rode de novo com a fonte configurada:");
    log("    LEGACY_FILES_BASE=http://<host-do-legado> PENDING_ONLY=true bun run scripts/migrate-sac-files.ts");
  }
  if (DRY_RUN) log("  ⚠️  DRY RUN — nada foi escrito");
  log("══════════════════════════════════════════════════");
}

// Executa só quando chamado como script (permite importar as funções puras nos testes).
if (import.meta.main) {
  main().catch((e) => {
    console.error("[sac-files] falhou:", e);
    process.exit(1);
  });
}
