/**
 * Estado dos filtros da tela de relatórios e a tradução para os parâmetros da
 * API. Cada relatório declara no catálogo quais filtros usa; só esses vão na
 * requisição e aparecem na barra.
 */
import type { ReportFilters } from "@/services/reports.service";

export type TFiltroDoRelatorio =
  | "period"
  | "project"
  | "entity"
  | "user"
  | "location"
  | "perfil"
  | "situacao"
  | "granularidade"
  | "etapa"
  | "funcao";

export type TEstadoDosFiltros = {
  dateFrom: string;
  dateTo: string;
  projectIds: string[];
  entityId: string | null;
  userId: string | null;
  uf: string;
  city: string;
  perfil: string;
  situacao: string;
  granularidade: string;
  etapa: string;
  funcao: string;
};

export const ESTADO_INICIAL_DOS_FILTROS: TEstadoDosFiltros = {
  dateFrom: "",
  dateTo: "",
  projectIds: [],
  entityId: null,
  userId: null,
  uf: "",
  city: "",
  perfil: "responsavel",
  situacao: "todos",
  granularidade: "mes",
  etapa: "",
  funcao: "",
};

export const OPCOES_DE_PERFIL = [
  { value: "responsavel", label: "Por responsável" },
  { value: "homologacao", label: "Por quem homologou" },
];

export const OPCOES_DE_SITUACAO = [
  { value: "todos", label: "Todos" },
  { value: "abertos", label: "Em aberto" },
  { value: "encerrados", label: "Encerrados" },
];

export const OPCOES_DE_GRANULARIDADE = [
  { value: "mes", label: "Mensal" },
  { value: "ano", label: "Anual" },
];

/** Início do dia no fuso do navegador: `new Date("2026-09-01")` seria meia-noite UTC. */
const inicioDoDia = (data: string) => new Date(`${data}T00:00:00`).toISOString();
const fimDoDia = (data: string) => new Date(`${data}T23:59:59.999`).toISOString();

type TParametros = Partial<Record<keyof ReportFilters, string>>;

/** O que cada filtro manda para a API (strategy por filtro). */
const PARAMETROS_DO_FILTRO: Record<TFiltroDoRelatorio, (e: TEstadoDosFiltros) => TParametros> = {
  period: (e) => ({
    date_from: e.dateFrom ? inicioDoDia(e.dateFrom) : undefined,
    date_to: e.dateTo ? fimDoDia(e.dateTo) : undefined,
  }),
  project: (e) => ({ project_ids: e.projectIds.length ? e.projectIds.join(",") : undefined }),
  entity: (e) => ({ entity_id: e.entityId ?? undefined }),
  user: (e) => ({ user_id: e.userId ?? undefined }),
  location: (e) => ({ uf: e.uf.trim() || undefined, city: e.city.trim() || undefined }),
  perfil: (e) => ({ perfil: e.perfil }),
  situacao: (e) => ({ situacao: e.situacao }),
  granularidade: (e) => ({ granularidade: e.granularidade }),
  etapa: (e) => ({ etapa: e.etapa || undefined }),
  funcao: (e) => ({ funcao: e.funcao || undefined }),
};

export function buildReportParams(estado: TEstadoDosFiltros, filtros: TFiltroDoRelatorio[]): ReportFilters {
  const todos = Object.assign({}, ...filtros.map((f) => PARAMETROS_DO_FILTRO[f](estado))) as TParametros;
  return Object.fromEntries(Object.entries(todos).filter(([, valor]) => !!valor)) as ReportFilters;
}

export function hasFiltroAtivo(estado: TEstadoDosFiltros): boolean {
  return (Object.keys(ESTADO_INICIAL_DOS_FILTROS) as (keyof TEstadoDosFiltros)[]).some(
    (chave) => JSON.stringify(estado[chave]) !== JSON.stringify(ESTADO_INICIAL_DOS_FILTROS[chave])
  );
}

const formatData = (data: string) => data.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");

const readPeriodo = (e: TEstadoDosFiltros) =>
  e.dateFrom || e.dateTo
    ? `${e.dateFrom ? formatData(e.dateFrom) : "início"} a ${e.dateTo ? formatData(e.dateTo) : "hoje"}`
    : "Todo o período";

export type TNomesDosFiltros = { sistemas: string[]; usuario?: string | null; entidade?: string | null };

/** Resumo dos filtros para o cabeçalho da impressão. Filtro vazio não aparece. */
export function buildPrintMeta(estado: TEstadoDosFiltros, nomes: TNomesDosFiltros) {
  const local = [estado.city.trim(), estado.uf.trim().toUpperCase()].filter(Boolean).join(" / ");
  return [
    { label: "Período", value: readPeriodo(estado) },
    { label: "Sistemas", value: nomes.sistemas.length ? nomes.sistemas.join(", ") : "Todos" },
    { label: "Entidade", value: nomes.entidade ?? "" },
    { label: "Pessoa", value: nomes.usuario ?? "" },
    { label: "Local", value: local },
    { label: "Etapa", value: estado.etapa },
  ].filter((item) => !!item.value);
}
