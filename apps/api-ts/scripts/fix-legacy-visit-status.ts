/**
 * Corrige a situação das visitas técnicas já migradas do SAC legado.
 *
 * A primeira versão de `migrate-sac.ts` gravava `visita_situacao === 1 ? 1 : 0`.
 * No Plane o 1 é "Em Andamento", então toda visita concluída no SAC ficou em
 * andamento. Este script relê o MySQL legado e aplica o mapeamento de
 * `@modules/technical-visit/legacy-visit-status` pelo id legado.
 *
 * Idempotente: só atualiza a visita cujo status AINDA é o que o importador antigo
 * gravou. Visita já corrigida, ou alterada pela tela depois da migração, fica como
 * está. Rodar duas vezes não muda nada na segunda.
 *
 * Canceladas (`visita_status = 0`) nunca foram importadas pela versão antiga; elas
 * chegam pelo `migrate-sac.ts` corrigido. Aqui só são corrigidas se já existirem.
 *
 * Uso (a partir de apps/api-ts, para o Bun ler os aliases do bunfig.toml):
 *   DATABASE_URL=postgresql://... \
 *   MYSQL_HOST=10.1.2.32 MYSQL_PORT=3306 MYSQL_USER=... MYSQL_PASS=... MYSQL_DB=quality_site_dev \
 *   WORKSPACE_SLUG=quality \
 *   bun run scripts/fix-legacy-visit-status.ts
 *
 * Opções (env):
 *   DRY_RUN=true   - só conta o que seria alterado
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool as PgPool } from "pg";
import {
  planVisitStatusCorrections,
  type ILegacyVisita,
  type IVisitStatusCorrection,
} from "@modules/technical-visit/legacy-visit-status";

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

const pgPool = new PgPool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pgPool) });

const log = (msg: string) => console.log(msg);

const buildWhere = (workspaceId: string, correction: IVisitStatusCorrection) => ({
  workspaceId,
  deletedAt: null,
  legacyId: { in: correction.legacyIds },
  status: correction.from,
});

const readLegacyVisitas = async (): Promise<ILegacyVisita[]> => {
  const mysql2 = await import("mysql2/promise");
  // `as any`: os overloads de ConnectionOptions do mysql2 não aceitam `ssl: false`
  // literal, embora o driver aceite (mesmo padrão de migrate-sac.ts).
  const conn = await mysql2.createConnection({ ...MYSQL_CONFIG } as any);
  const [rows] = await conn.query<any[]>("SELECT visita_id, visita_situacao, visita_status FROM visita");
  await conn.end();
  return rows as ILegacyVisita[];
};

const applyCorrection = async (workspaceId: string, correction: IVisitStatusCorrection): Promise<number> => {
  const where = buildWhere(workspaceId, correction);
  if (DRY_RUN) return prisma.technicalVisit.count({ where });
  const { count } = await prisma.technicalVisit.updateMany({ where, data: { status: correction.to } });
  return count;
};

async function main() {
  log(`Correção da situação das visitas${DRY_RUN ? " (DRY RUN)" : ""}`);
  log(`MySQL: ${MYSQL_CONFIG.database}@${MYSQL_CONFIG.host}`);

  const workspace = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG, deletedAt: null } });
  if (!workspace) throw new Error(`Workspace '${WORKSPACE_SLUG}' não encontrado.`);

  const visitas = await readLegacyVisitas();
  log(`${visitas.length} visitas lidas do legado`);

  const plano = planVisitStatusCorrections(visitas);
  let total = 0;
  for (const correction of plano) {
    const count = await applyCorrection(workspace.id, correction);
    total += count;
    log(`  ${correction.from} -> ${correction.to}: ${count} de ${correction.legacyIds.length} candidatas`);
  }
  log(`${DRY_RUN ? "Seriam alteradas" : "Alteradas"}: ${total}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pgPool.end();
  });
