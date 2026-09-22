/**
 * Põe nos sistemas (projetos) migrados do SAC o ícone que o painel de TV do
 * legado usava. Regra em `utils/icones-dos-sistemas.ts`.
 *
 * `scripts/data/icones-sistemas.json` (sistemas_id → PNG 50x50 em data URI) foi
 * recortado do sprite `intranet/painel/img/imgFundoIcones.png` com as posições
 * de `intranet/painel/painel_ti_posico.php`. Sistemas que o legado marcava como
 * "colocar o ícone" ou "sem sistema" não têm ícone e ficam como estão.
 *
 * Idempotente, e não troca emoji nem ícone escolhidos no Plane.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... bun run scripts/import-icones-sistemas.ts
 *   DRY_RUN=true ...                    só relata
 */
import prisma from "@db";
import { planIconesDosSistemas } from "@utils/icones-dos-sistemas";
import icones from "./data/icones-sistemas.json";

const DRY_RUN = process.env.DRY_RUN === "true";

const projetos = await prisma.project.findMany({
  where: { deletedAt: null, externalSource: "sac_migration" },
  select: { id: true, externalSource: true, externalId: true, iconProp: true },
});

const atualizacoes = planIconesDosSistemas(projetos, icones as Record<string, string>);

for (const { projectId, iconProp } of atualizacoes) {
  if (DRY_RUN) continue;
  // oxlint-disable-next-line no-await-in-loop
  await prisma.project.update({ where: { id: projectId }, data: { iconProp } });
}

console.log(
  `[import-icones-sistemas] ${projetos.length} sistema(s) migrado(s), ${atualizacoes.length} ${DRY_RUN ? "receberiam" : "receberam"} o ícone.`
);
await prisma.$disconnect();
