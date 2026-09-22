/**
 * Correção das funções de bases já migradas do SAC (permissões v2).
 *
 * 1. Associações com o nível 10, que não existe no modelo de papéis
 *    (20/18/15/12/8/6/5): espaço vira Atendimento; vínculo com sistema recebe o
 *    maior nível válido que a pessoa já tem nos outros sistemas (ou o do espaço).
 *    Regra em `fixNiveisLegado` (src/utils/papel-do-setor.ts).
 * 2. Com REATIVAR_CAMPO=true, lê o SAC e reativa representante, consultor e
 *    técnico, que o importador antigo deixava INATIVOS: técnico como
 *    Atendimento, representante e consultor como Visualizador. Só quem está na
 *    ativa no SAC (usu_ativo=1 e não "congelado").
 *
 * Idempotente: rodar de novo não muda nada.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... bun run scripts/fix-papeis-legado.ts
 *
 * Variáveis:
 *   WORKSPACE_SLUG=quality   espaço a corrigir
 *   DRY_RUN=true             só relata, não grava
 *   REATIVAR_CAMPO=true      passo 2 (precisa do MySQL: MYSQL_HOST, MYSQL_PORT,
 *                            MYSQL_USER, MYSQL_PASS, MYSQL_DB, como o migrate-sac)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { NIVEL_INVALIDO_LEGADO, fixNiveisLegado, isSetorDeCampo, resolveNivelDoSetor } from "@utils/papel-do-setor";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DRY_RUN = process.env.DRY_RUN === "true";
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";

const log = (msg: string) => console.log(`[fix-papeis-legado] ${msg}`);

async function reportNiveisInvalidos(workspaceId: string) {
  const [ws, pm] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId, role: NIVEL_INVALIDO_LEGADO, deletedAt: null } }),
    prisma.projectMember.count({ where: { workspaceId, role: NIVEL_INVALIDO_LEGADO, deletedAt: null } }),
  ]);
  log(`nível ${NIVEL_INVALIDO_LEGADO}: ${ws} no espaço, ${pm} em sistemas`);
}

type UsuarioSac = { usuarios_id: number; usuarios_setor: string; usu_ativo: number; usuarios_situacao: string | null };

async function readUsuariosDeCampo(): Promise<UsuarioSac[]> {
  const mysql2 = await import("mysql2/promise");
  const conn = await mysql2.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS,
    database: process.env.MYSQL_DB,
  });
  const [linhas] = await conn.query<any[]>(
    "SELECT usuarios_id, usuarios_setor, usu_ativo, usuarios_situacao FROM usuarios WHERE usu_ativo = 1"
  );
  await conn.end();
  return (linhas as UsuarioSac[]).filter(
    (u) =>
      isSetorDeCampo(u.usuarios_setor) &&
      String(u.usuarios_situacao ?? "")
        .toLowerCase()
        .trim() !== "congelado"
  );
}

async function reactivateCampo(workspaceId: string) {
  const usuarios = await readUsuariosDeCampo();
  log(`${usuarios.length} conta(s) de campo na ativa no SAC`);
  let reativadas = 0;
  for (const u of usuarios) {
    const user = await prisma.user.findFirst({ where: { username: `sac_${u.usuarios_id}` } });
    if (!user) continue;
    const nivel = resolveNivelDoSetor(u.usuarios_setor);
    const funcao = await prisma.workflowRole.findFirst({ where: { workspaceId, level: nivel, deletedAt: null } });
    if (DRY_RUN) {
      log(`reativaria ${user.email} (${u.usuarios_setor}) com nível ${nivel}`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    const vinculo = { role: nivel, isActive: true, workflowRoleId: funcao?.id ?? null };
    const existente = await prisma.workspaceMember.findFirst({
      where: { workspaceId, memberId: user.id, deletedAt: null },
    });
    await (existente
      ? prisma.workspaceMember.update({ where: { id: existente.id }, data: vinculo })
      : prisma.workspaceMember.create({ data: { workspaceId, memberId: user.id, ...vinculo } }));
    await prisma.projectMember.updateMany({
      where: { workspaceId, memberId: user.id, deletedAt: null },
      data: vinculo,
    });
    reativadas++;
  }
  log(`${reativadas} conta(s) de campo reativada(s)`);
}

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG, deletedAt: null } });
  if (!ws) throw new Error(`Espaço '${WORKSPACE_SLUG}' não encontrado.`);
  log(`espaço ${ws.slug}${DRY_RUN ? " (DRY_RUN)" : ""}`);
  await reportNiveisInvalidos(ws.id);
  if (!DRY_RUN) {
    const r = await fixNiveisLegado(prisma, ws.id);
    log(`corrigidos: ${r.workspaceMembers} no espaço, ${r.projectMembers} em sistemas`);
  }
  if (process.env.REATIVAR_CAMPO === "true") await reactivateCampo(ws.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
