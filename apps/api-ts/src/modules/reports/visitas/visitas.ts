/**
 * Recortes do relatório de visitas técnicas (`relatorioVisita.php` e
 * `relatorioVisitaSistema.php` do SAC): filtro por UF, cidade e sistema, e a
 * contagem por sistema atendido. Puro.
 *
 * A UF é a da entidade (a visita só guarda a cidade). A cidade é a da visita e,
 * quando ela não tem, a da entidade.
 */
import { normalizeTexto } from "@modules/reports/comum/tipo-do-chamado";

export type VisitaDoRecorte = {
  city: string | null;
  entityCity: string | null;
  entityUf: string | null;
  projectIds: unknown;
};

export type FiltroDeVisitas = { uf?: string; cidade?: string; projetoIds?: string[] };

/** `technical_visits.project_ids` é JSON: só strings valem. */
export const readProjetosDaVisita = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];

const readCidade = (v: VisitaDoRecorte) => normalizeTexto(v.city ?? v.entityCity ?? "");

const FILTROS: {
  [K in keyof FiltroDeVisitas]-?: (valor: NonNullable<FiltroDeVisitas[K]>) => (v: VisitaDoRecorte) => boolean;
} = {
  uf: (uf) => (v) => normalizeTexto(v.entityUf ?? "") === normalizeTexto(uf),
  cidade: (cidade) => (v) => readCidade(v) === normalizeTexto(cidade),
  projetoIds: (ids) => (v) => readProjetosDaVisita(v.projectIds).some((id) => ids.includes(id)),
};

export function filterVisitas<T extends VisitaDoRecorte>(visitas: T[], filtro: FiltroDeVisitas): T[] {
  const ativos = (Object.keys(FILTROS) as (keyof FiltroDeVisitas)[])
    .filter((chave) => filtro[chave]?.length)
    .map((chave) => (FILTROS[chave] as (valor: unknown) => (v: VisitaDoRecorte) => boolean)(filtro[chave]));
  return visitas.filter((v) => ativos.every((passa) => passa(v)));
}

export function countVisitasPorSistema(visitas: VisitaDoRecorte[]): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const visita of visitas) {
    for (const id of new Set(readProjetosDaVisita(visita.projectIds))) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }
  return contagem;
}
