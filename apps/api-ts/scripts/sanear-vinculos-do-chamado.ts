/**
 * Saneamento das etiquetas/responsáveis duplicados de um chamado.
 *
 * Antes da correção, cada troca de etiqueta apagava logicamente TODAS as linhas
 * do chamado e recriava as escolhidas, deixando resíduo em issue_labels: a
 * mesma etiqueta com uma linha viva e uma (ou mais) apagada. Como a chave única
 * é (issue_id, label_id, deleted_at), a troca seguinte tentava carimbar as duas
 * com o mesmo deleted_at e o Postgres respondia
 * {"detail":"Registro já existe."} — o chamado travava para adicionar E remover.
 * O mesmo vale para issue_assignees (issue_id, assignee_id, deleted_at).
 *
 * Este script deixa NO MÁXIMO UMA linha por par: mantém a viva; se não houver
 * viva, mantém a apagada mais recente. Só remove linhas redundantes — nenhum
 * vínculo vivo é perdido.
 *
 * Idempotente: rodar de novo sem duplicidade não faz nada.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... bun run scripts/sanear-vinculos-do-chamado.ts
 *
 * Opções (variáveis de ambiente):
 *   DRY_RUN=true   - Só relata o que seria removido, não escreve nada
 */

import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@prisma/client";
import {Pool} from "pg";

const pool = new Pool({connectionString: process.env.DATABASE_URL});
const prisma = new PrismaClient({adapter: new PrismaPg(pool)});

const DRY_RUN = process.env.DRY_RUN === "true";

const TABELAS = [
  {nome: "issue_labels", coluna: "label_id"},
  {nome: "issue_assignees", coluna: "assignee_id"},
] as const;

function log(msg: string) {
  console.log(`[sanear-vinculos] ${msg}`);
}

/**
 * Ordem de preferência dentro do par: a linha viva primeiro; entre apagadas, a
 * mais recente. Da segunda posição em diante é resíduo.
 */
function residuos(tabela: string, coluna: string) {
  return `
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY issue_id, ${coluna}
        ORDER BY (deleted_at IS NULL) DESC, deleted_at DESC, created_at DESC, id
      ) AS posicao
      FROM ${tabela}
    ) ranqueadas WHERE posicao > 1`;
}

async function sanear(tabela: string, coluna: string) {
  const [{count}] = await prisma.$queryRawUnsafe<{count: bigint}[]>(
    `SELECT count(*)::bigint AS count FROM (${residuos(tabela, coluna)}) r`,
  );
  const [{chamados}] = await prisma.$queryRawUnsafe<{chamados: bigint}[]>(
    `SELECT count(DISTINCT issue_id)::bigint AS chamados FROM ${tabela}
     WHERE id IN (${residuos(tabela, coluna)})`,
  );

  log(`${tabela}: ${count} linha(s) redundante(s) em ${chamados} chamado(s)`);
  if (DRY_RUN || count === 0n) return Number(count);

  const removidas = await prisma.$executeRawUnsafe(
    `DELETE FROM ${tabela} WHERE id IN (${residuos(tabela, coluna)})`,
  );
  log(`${tabela}: ${removidas} linha(s) removida(s)`);
  return removidas;
}

async function main() {
  log(`Iniciando${DRY_RUN ? " (SIMULAÇÃO)" : ""}`);

  let total = 0;
  for (const {nome, coluna} of TABELAS) total += await sanear(nome, coluna);

  log(`Pronto. ${total} linha(s) ${DRY_RUN ? "seriam removidas" : "removidas"}.`);
  if (DRY_RUN) log("⚠️  SIMULAÇÃO — nada foi escrito");

  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error("Saneamento falhou:", e);
  process.exit(1);
});
