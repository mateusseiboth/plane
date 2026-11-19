/**
 * Acerta os sistemas já importados do legado (testes da nova intranet 3):
 * sistema web (categoria 3) ganha "Web" no nome e os inativos são arquivados.
 * Regras em `@modules/project/sistema-do-legado.rules`; a importação nova
 * (`migrate-sac.ts`) já grava assim.
 *
 *   LEGACY_INTRANET_DB_URL=mysql://... bun run scripts/ajustar-sistemas-do-legado.ts
 *   DRY_RUN=1 ...   só mostra o que faria
 *
 * Idempotente: rodar de novo não muda nada.
 */
import mysql from "mysql2/promise";
import prisma from "@db";
import { buildAjusteDoSistema, type SistemaDoLegado } from "@modules/project/sistema-do-legado.rules";

const DRY_RUN = process.env.DRY_RUN === "1";

async function readSistemasDoLegado(url: string): Promise<Map<string, SistemaDoLegado>> {
  const conexao = await mysql.createConnection({ uri: url, ssl: undefined });
  try {
    const [linhas] = await conexao.query<any[]>(
      "SELECT sistemas_id, sistemas_nome, sistemas_apelido, categoria FROM sistemas WHERE status = 1"
    );
    return new Map(
      (linhas as SistemaDoLegado[]).map((linha) => [
        String(linha.sistemas_id),
        { ...linha, sistemas_id: Number(linha.sistemas_id), categoria: Number(linha.categoria ?? 0) },
      ])
    );
  } finally {
    await conexao.end();
  }
}

async function main() {
  const url = process.env.LEGACY_INTRANET_DB_URL?.trim();
  if (!url) throw new Error("Defina LEGACY_INTRANET_DB_URL (MySQL da intranet legada, só leitura).");

  const legado = await readSistemasDoLegado(url);
  const projetos = await prisma.project.findMany({
    where: { externalSource: "sac_migration", deletedAt: null },
    select: { id: true, name: true, archivedAt: true, externalId: true },
  });

  const agora = new Date();
  const contagem = { renomeados: 0, arquivados: 0, semRegistroNoLegado: 0, inalterados: 0 };
  for (const projeto of projetos) {
    const sistema = legado.get(projeto.externalId ?? "");
    if (!sistema) {
      contagem.semRegistroNoLegado += 1;
      continue;
    }
    const ajuste = buildAjusteDoSistema(projeto, sistema, agora);
    if (!ajuste.name && !ajuste.archivedAt) {
      contagem.inalterados += 1;
      continue;
    }
    if (ajuste.name) contagem.renomeados += 1;
    if (ajuste.archivedAt) contagem.arquivados += 1;
    console.log(`${DRY_RUN ? "[dry] " : ""}${sistema.sistemas_id} ${projeto.name}: ${JSON.stringify(ajuste)}`);
    if (!DRY_RUN) await prisma.project.update({ where: { id: projeto.id }, data: ajuste });
  }
  console.log(JSON.stringify({ sistemasNoPlane: projetos.length, ...contagem }));
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
