/**
 * Importa o pós-atendimento do SAC para `pos_atendimentos`. Idempotente pelo
 * `legacy_id` (= `posatendimento_id`): rodar de novo não duplica.
 *
 * Duas fontes:
 *
 * 1. **MySQL legado** (com `MYSQL_HOST`): relê a tabela `posatendimento` inteira.
 *    Chamado de visita cujo pós foi feito pela visita (`visita_posatendimento = 1`)
 *    vai para a VISITA; o resto vai para o chamado. Atualiza o que já foi importado
 *    (inclusive o que veio dos comentários, que perdeu a expectativa).
 * 2. **Sem MySQL**: converte os comentários `pos-N` que o importador antigo
 *    (`migrate-sac.ts` §12) gravou nos chamados. A expectativa fica NULA: ali ela
 *    virou booleano. Nunca sobrescreve um registro que já existe.
 *
 * Chamado com mais de um pós no legado: fica o mais recente. Destino que já tem um
 * pós feito no Plane (sem `legacy_id`) não é tocado. Os comentários `pos-N`
 * continuam no chamado (histórico); nada é apagado.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... bun run scripts/import-pos-atendimento.ts
 *
 * Variáveis:
 *   WORKSPACE_SLUG=quality   espaço de destino
 *   DRY_RUN=true             só relata, não grava
 *   MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASS, MYSQL_DB  (como o migrate-sac)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@prisma/client";
import { Pool } from "pg";
import {
  keepOnePorAlvo,
  mapComentarioPos,
  mapLinhaDoSac,
  resolveAlvoDoSac,
  type LinhaDoSac,
  type MapasDoSac,
} from "@modules/pos-atendimento/pos-atendimento.legado";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DRY_RUN = process.env.DRY_RUN === "true";
const WORKSPACE_SLUG = process.env.WORKSPACE_SLUG ?? "quality";
const LOTE = 1000;

const log = (msg: string) => console.log(`[import-pos-atendimento] ${msg}`);

type Alvo = { issueId: string } | { visitId: string };
type Resumo = { lidos: number; gravados: number; semDestino: number; repetidos: number; ocupados: number };

const chaveDoAlvo = (alvo: Alvo) => ("issueId" in alvo ? `issue:${alvo.issueId}` : `visit:${alvo.visitId}`);

/** O CHECK da tabela exige exatamente um: o outro vai nulo explicitamente (mudar de chamado para visita). */
const toColunasDoAlvo = (alvo: Alvo) => ({
  issueId: "issueId" in alvo ? alvo.issueId : null,
  visitId: "visitId" in alvo ? alvo.visitId : null,
});

const chunk = <T>(itens: T[], tamanho = LOTE): T[][] =>
  Array.from({ length: Math.ceil(itens.length / tamanho) }, (_, i) => itens.slice(i * tamanho, (i + 1) * tamanho));

async function findInChunks<T, R>(valores: T[], buscar: (lote: T[]) => Promise<R[]>): Promise<R[]> {
  const partes = await Promise.all(chunk(valores).map(buscar));
  return partes.flat();
}

/** Quem já ocupa cada destino, para não sobrescrever pós feito no Plane nem outro legado. */
async function findOcupantes(workspaceId: string, alvos: Alvo[]): Promise<Map<string, number | null>> {
  const issueIds = alvos.flatMap((a) => ("issueId" in a ? [a.issueId] : []));
  const visitIds = alvos.flatMap((a) => ("visitId" in a ? [a.visitId] : []));
  const existentes = [
    ...(await findInChunks(issueIds, (lote) =>
      prisma.posAtendimento.findMany({
        where: { workspaceId, issueId: { in: lote } },
        select: { issueId: true, visitId: true, legacyId: true },
      })
    )),
    ...(await findInChunks(visitIds, (lote) =>
      prisma.posAtendimento.findMany({
        where: { workspaceId, visitId: { in: lote } },
        select: { issueId: true, visitId: true, legacyId: true },
      })
    )),
  ];
  return new Map(
    existentes.map((e) => [chaveDoAlvo(e.issueId ? { issueId: e.issueId } : { visitId: e.visitId! }), e.legacyId])
  );
}

const isOcupadoPorOutro = (ocupantes: Map<string, number | null>, alvo: Alvo, legacyId: number) =>
  ocupantes.has(chaveDoAlvo(alvo)) && ocupantes.get(chaveDoAlvo(alvo)) !== legacyId;

// ── Fonte 1: MySQL ───────────────────────────────────────────────────────────

/**
 * Reimportar atualiza o registro legado, mas não desfaz uma verificação feita no
 * Plane depois: linha não verificada no SAC deixa os campos de verificação como estão.
 */
const buildUpdate = (data: Prisma.PosAtendimentoUncheckedCreateInput): Prisma.PosAtendimentoUncheckedUpdateInput =>
  data.verifiedAt ? data : { ...data, verifiedAt: undefined, verifiedById: undefined, verificationComment: undefined };

async function connectMysql() {
  if (!process.env.MYSQL_HOST) return null;
  const mysql2 = await import("mysql2/promise");
  return mysql2
    .createConnection({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASS,
      database: process.env.MYSQL_DB,
    })
    .catch((erro: Error) => {
      log(`MySQL indisponível (${erro.message}); usando os comentários pos-N.`);
      return null;
    });
}

type ConexaoMysql = NonNullable<Awaited<ReturnType<typeof connectMysql>>>;

async function buildMapasDoSac(workspaceId: string, linhas: LinhaDoSac[], conn: ConexaoMysql): Promise<MapasDoSac> {
  const chamadoIds = [...new Set(linhas.map((l) => String(l.posatendimento_chamados_id)))];
  const issues = await findInChunks(chamadoIds, (lote) =>
    prisma.issue.findMany({
      where: { workspaceId, externalSource: "sac_migration", externalId: { in: lote }, deletedAt: null },
      select: { id: true, externalId: true },
    })
  );
  const [visitasSac] = await conn.query<any[]>(
    "SELECT visita_id, visita_chamados_id FROM visita WHERE visita_posatendimento = 1 AND visita_chamados_id IS NOT NULL"
  );
  const visitas = await prisma.technicalVisit.findMany({
    where: { workspaceId, deletedAt: null, legacyId: { in: visitasSac.map((v) => Number(v.visita_id)) } },
    select: { id: true, legacyId: true },
  });
  const visitPorLegado = new Map(visitas.map((v) => [v.legacyId, v.id]));
  return {
    chamados: new Map(issues.map((i) => [Number(i.externalId), i.id])),
    visitas: new Map(
      visitasSac
        .filter((v) => visitPorLegado.has(Number(v.visita_id)))
        .map((v) => [Number(v.visita_chamados_id), visitPorLegado.get(Number(v.visita_id))!])
    ),
  };
}

async function findUsuariosDoSac(ids: number[]): Promise<Map<number, string>> {
  const usernames = [...new Set(ids)].map((id) => `sac_${id}`);
  const usuarios = await findInChunks(usernames, (lote) =>
    prisma.user.findMany({ where: { username: { in: lote } }, select: { id: true, username: true } })
  );
  return new Map(usuarios.map((u) => [Number(String(u.username).slice("sac_".length)), u.id]));
}

async function importFromMysql(workspaceId: string, conn: ConexaoMysql): Promise<Resumo> {
  const [linhas] = await conn.query<any[]>("SELECT * FROM posatendimento ORDER BY posatendimento_id");
  const mapas = await buildMapasDoSac(workspaceId, linhas as LinhaDoSac[], conn);
  const usuarios = await findUsuariosDoSac(
    linhas.flatMap((l) => [l.posatendimento_usuarios_id, l.posatendimento_usuarios_id_qualidade]).filter(Boolean)
  );
  const comDestino = (linhas as LinhaDoSac[]).flatMap((linha) => {
    const alvo = resolveAlvoDoSac(linha.posatendimento_chamados_id, mapas);
    return alvo ? [{ ...mapLinhaDoSac(linha), destino: alvo, alvo: chaveDoAlvo(alvo) }] : [];
  });
  const { mantidos, descartados } = keepOnePorAlvo(comDestino);
  const ocupantes = await findOcupantes(
    workspaceId,
    mantidos.map((m) => m.destino)
  );
  const livres = mantidos.filter((m) => !isOcupadoPorOutro(ocupantes, m.destino, m.legacyId));

  // Lote a lote, em sequência: 11 mil upserts de uma vez esgotariam o pool.
  for (const lote of chunk(DRY_RUN ? [] : livres, 200)) {
    // oxlint-disable-next-line no-await-in-loop
    await prisma.$transaction(
      lote.map(({ destino, alvo: _alvo, legacyRecordedBy, legacyVerifiedBy, ...pos }) => {
        const data = {
          ...pos,
          ...toColunasDoAlvo(destino),
          workspaceId,
          recordedById: legacyRecordedBy ? (usuarios.get(legacyRecordedBy) ?? null) : null,
          verifiedById: legacyVerifiedBy ? (usuarios.get(legacyVerifiedBy) ?? null) : null,
        } satisfies Prisma.PosAtendimentoUncheckedCreateInput;
        return prisma.posAtendimento.upsert({
          where: { legacyId: pos.legacyId },
          create: data,
          update: buildUpdate(data),
        });
      })
    );
  }
  return {
    lidos: linhas.length,
    gravados: livres.length,
    semDestino: linhas.length - comDestino.length,
    repetidos: descartados.length,
    ocupados: mantidos.length - livres.length,
  };
}

// ── Fonte 2: comentários pos-N ───────────────────────────────────────────────

async function importFromComentarios(workspaceId: string): Promise<Resumo> {
  const comentarios = await prisma.issueComment.findMany({
    where: {
      workspaceId,
      externalSource: "sac_migration",
      externalId: { startsWith: "pos-" },
      deletedAt: null,
      issue: { deletedAt: null },
    },
    select: {
      issueId: true,
      externalId: true,
      actorId: true,
      createdAt: true,
      commentStripped: true,
      commentJson: true,
    },
  });
  const convertidos = comentarios.flatMap((c) => {
    const pos = mapComentarioPos(c);
    return pos ? [{ ...pos, alvo: `issue:${pos.issueId}` }] : [];
  });
  const { mantidos, descartados } = keepOnePorAlvo(convertidos);
  const jaImportados = new Set(
    (
      await findInChunks(
        mantidos.map((m) => m.legacyId),
        (lote) => prisma.posAtendimento.findMany({ where: { legacyId: { in: lote } }, select: { legacyId: true } })
      )
    ).map((p) => p.legacyId)
  );
  const novos = mantidos.filter((m) => !jaImportados.has(m.legacyId));
  const ocupantes = await findOcupantes(
    workspaceId,
    novos.map((m) => ({ issueId: m.issueId }))
  );
  const livres = novos.filter((m) => !ocupantes.has(`issue:${m.issueId}`));

  for (const lote of chunk(DRY_RUN ? [] : livres)) {
    // oxlint-disable-next-line no-await-in-loop
    await prisma.posAtendimento.createMany({
      data: lote.map(({ alvo: _alvo, ...pos }) => Object.assign(pos, { workspaceId })),
      skipDuplicates: true,
    });
  }
  return {
    lidos: comentarios.length,
    gravados: livres.length,
    semDestino: comentarios.length - convertidos.length,
    repetidos: descartados.length,
    ocupados: novos.length - livres.length,
  };
}

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { slug: WORKSPACE_SLUG, deletedAt: null } });
  if (!ws) throw new Error(`Espaço '${WORKSPACE_SLUG}' não encontrado.`);
  const conn = await connectMysql();
  log(`espaço ${ws.slug}, fonte: ${conn ? "MySQL" : "comentários pos-N"}${DRY_RUN ? " (DRY_RUN)" : ""}`);
  const resumo = conn ? await importFromMysql(ws.id, conn) : await importFromComentarios(ws.id);
  await conn?.end();
  log(`lidos ${resumo.lidos}, gravados ${resumo.gravados}${DRY_RUN ? " (simulado)" : ""}`);
  log(`sem chamado/visita migrado: ${resumo.semDestino}`);
  log(`repetidos no mesmo destino (ficou o mais recente): ${resumo.repetidos}`);
  log(`destino já com outro pós (não tocado): ${resumo.ocupados}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
