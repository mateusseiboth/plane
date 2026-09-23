/**
 * Espelha no Plane quem ainda é cliente, lendo a intranet legada de produção.
 *
 *   LEGACY_INTRANET_DB_URL=mysql://... bun run scripts/sync-situacao-entidades.ts
 *   DRY_RUN=1 ...   só mostra o que faria
 *
 * Regra em `situacao-da-entidade-legado.ts`: "descongelado" com status 1 fica
 * ativa; o resto fica inativa e congelada, com o motivo da sincronização em
 * `frozen_reason`. O descongelamento automático só mexe em quem foi congelado
 * por esta rotina: congelamento feito à mão no Plane não é desfeito daqui.
 * Idempotente: rodar de novo não muda nada se a intranet não mudou.
 */
import mysql from "mysql2/promise";
import prisma from "@db";
import { MOTIVO_DA_SINCRONIZACAO, readSituacaoDaEntidade } from "./situacao-da-entidade-legado";

const DRY_RUN = process.env.DRY_RUN === "1";

type LinhaDaIntranet = {
  entidades_id: number;
  entidades_situacao: string | null;
  entidades_status: number | null;
  entidades_sac_desktop_id: number | null;
};

async function readIntranet(url: string): Promise<LinhaDaIntranet[]> {
  const conexao = await mysql.createConnection({ uri: url, ssl: undefined });
  try {
    const [linhas] = await conexao.query<any[]>(
      "SELECT entidades_id, entidades_situacao, entidades_status, entidades_sac_desktop_id FROM entidades"
    );
    return linhas as LinhaDaIntranet[];
  } finally {
    await conexao.end();
  }
}

async function main() {
  const url = process.env.LEGACY_INTRANET_DB_URL?.trim();
  if (!url) throw new Error("Defina LEGACY_INTRANET_DB_URL (MySQL da intranet legada, só leitura).");

  const intranet = new Map(readSituacaoPorCodigo(await readIntranet(url)));
  const entidades = await prisma.entity.findMany({
    where: { deletedAt: null, legacyId: { not: null } },
    select: { id: true, name: true, legacyId: true, sacCode: true, isActive: true, frozenAt: true, frozenReason: true },
  });

  const contagem = { congeladas: 0, reativadas: 0, codigoSac: 0, semRegistroNaIntranet: 0, inalteradas: 0 };
  for (const entidade of entidades) {
    const situacao = intranet.get(entidade.legacyId!);
    if (!situacao) {
      contagem.semRegistroNaIntranet += 1;
      continue;
    }
    const congelarAgora = situacao.congelada && entidade.frozenAt === null;
    const reativarAgora =
      !situacao.congelada && entidade.frozenAt !== null && entidade.frozenReason === MOTIVO_DA_SINCRONIZACAO;
    const ativoMudou = entidade.isActive !== situacao.isActive;
    const sacMudou = situacao.sacCode !== null && entidade.sacCode !== situacao.sacCode;

    if (!congelarAgora && !reativarAgora && !ativoMudou && !sacMudou) {
      contagem.inalteradas += 1;
      continue;
    }
    const dados = {
      isActive: situacao.isActive,
      ...(sacMudou ? { sacCode: situacao.sacCode } : {}),
      ...(congelarAgora ? { frozenAt: new Date(), frozenReason: MOTIVO_DA_SINCRONIZACAO } : {}),
      ...(reativarAgora ? { frozenAt: null, frozenReason: null } : {}),
    };
    if (congelarAgora) contagem.congeladas += 1;
    if (reativarAgora) contagem.reativadas += 1;
    if (sacMudou) contagem.codigoSac += 1;
    console.log(`${DRY_RUN ? "[dry] " : ""}${entidade.legacyId} ${entidade.name}: ${JSON.stringify(dados)}`);
    if (!DRY_RUN) await prisma.entity.update({ where: { id: entidade.id }, data: dados });
  }
  console.log(JSON.stringify({ entidadesNoPlane: entidades.length, ...contagem }));
}

/** Código SAC válido é inteiro positivo; 0 ou nulo é "não tem". */
const readCodigoSac = (valor: unknown): number | null => {
  const codigo = Number(valor);
  return Number.isInteger(codigo) && codigo > 0 ? codigo : null;
};

function readSituacaoPorCodigo(linhas: LinhaDaIntranet[]) {
  return linhas.map(
    (l) =>
      [
        Number(l.entidades_id),
        {
          ...readSituacaoDaEntidade({
            situacao: l.entidades_situacao,
            status: l.entidades_status === null ? null : Number(l.entidades_status),
          }),
          sacCode: readCodigoSac(l.entidades_sac_desktop_id),
        },
      ] as const
  );
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
