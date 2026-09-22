/** Recorte (UF, cidade, sistema) e contagem por sistema da "Visão geral de visitas". */
import { projectNameMap, readTexto, type Filters } from "@modules/reports/comum/filtros";
import { countVisitasPorSistema, type FiltroDeVisitas, type VisitaDoRecorte } from "@modules/reports/visitas/visitas";

export const readFiltroDeVisitas = (query: Record<string, unknown>, f: Filters): FiltroDeVisitas => ({
  uf: readTexto(query.uf),
  cidade: readTexto(query.city),
  projetoIds: f.projectIds,
});

/** A visita como o relatório lê: a UF e a cidade da entidade entram no recorte. */
export const toVisitaDoRecorte = <
  T extends { city: string | null; projectIds: unknown; entity: { city: string | null; state: string | null } | null },
>(
  v: T
) => ({
  ...v,
  entityCity: v.entity?.city ?? null,
  entityUf: v.entity?.state ?? null,
});

export async function findVisitasPorSistema(workspaceId: string, visitas: VisitaDoRecorte[]) {
  const contagem = countVisitasPorSistema(visitas);
  const nomes = await projectNameMap(workspaceId, [...contagem.keys()]);
  return [...contagem.entries()]
    .map(([projetoId, count]) => ({ project_id: projetoId, name: nomes.get(projetoId)?.name ?? "—", count }))
    .toSorted((a, b) => b.count - a.count);
}
