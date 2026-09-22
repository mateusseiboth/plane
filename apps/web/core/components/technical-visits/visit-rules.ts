/**
 * Regras de tela da visita técnica. Puras, testadas em `visit-rules.test.ts`.
 *
 * `getVisitEditMode` só decide o que MOSTRAR habilitado. Quem decide de verdade é
 * a API (`visit-access.ts`), pela matriz de ações e pelo técnico da visita.
 */
import type { TTechnicalVisit, TVisitApiError, TVisitListFilters } from "./types";

export const VISIT_STATUS = {
  AGENDADA: 0,
  EM_ANDAMENTO: 1,
  RELATORIO: 2,
  AGUARDANDO_ASSINATURA: 3,
  CONCLUIDA: 4,
  CANCELADA: 5,
} as const;

const ENCERRADAS: ReadonlySet<number> = new Set([VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA]);

export const isVisitaEncerrada = (status: number): boolean => ENCERRADAS.has(status);

/** Cada `errors[i]` da API no campo de mesmo nome. A primeira mensagem do campo vence. */
export function mapVisitErrors(payload: unknown): Record<string, string> {
  const porCampo: Record<string, string> = {};
  for (const erro of (payload as TVisitApiError | undefined)?.errors ?? []) porCampo[erro.path] ??= erro.message;
  return porCampo;
}

export type TTrainingSheet = {
  /** `null` quando a visita não tem sistema marcado. */
  sistema: string | null;
  funcionalidades: string[];
  /** Nomes de quem recebeu o técnico, completados com linhas em branco. */
  participantes: string[];
};

type TSheetSource = { contact_records?: { name: string }[] } & Pick<Partial<TTechnicalVisit>, "projects" | "modules">;

/** Lista de presença do treinamento: uma folha por sistema da visita. */
export function buildTrainingSheets(visita: TSheetSource, linhasMinimas = 12): TTrainingSheet[] {
  const nomes = (visita.contact_records ?? []).map((c) => c.name);
  const participantes = [...nomes, ...Array<string>(Math.max(0, linhasMinimas - nomes.length)).fill("")];
  const projetos = visita.projects ?? [];
  if (!projetos.length) return [{ sistema: null, funcionalidades: [], participantes }];
  return projetos.map((projeto) => ({
    sistema: projeto.name,
    funcionalidades: (visita.modules ?? []).filter((m) => m.project_id === projeto.id).map((m) => m.name),
    participantes,
  }));
}

/** Filtros da lista no formato da API. Página conta a partir de zero. */
export function buildVisitListParams(filtros: TVisitListFilters, pagina: number, porPagina: number) {
  const params: Record<string, string> = {
    status: filtros.status === null || filtros.status === undefined ? "" : String(filtros.status),
    technician_id: filtros.technicianId ?? "",
    entity_id: filtros.entityId ?? "",
    date_from: filtros.dateFrom ?? "",
    date_to: filtros.dateTo ?? "",
    overdue: filtros.overdue ? "true" : "",
  };
  const preenchidos = Object.fromEntries(Object.entries(params).filter(([, valor]) => valor !== ""));
  return { ...preenchidos, cursor: `${porPagina}:${pagina}:0` };
}

/** `tudo`: agenda e relatório. `relatorio`: só o relatório. `leitura`: nada. */
export type TVisitEditMode = "tudo" | "relatorio" | "leitura";

type TPermissoes = { canRegister: boolean; canManageAll: boolean };

export function getVisitEditMode(
  visita: Pick<TTechnicalVisit, "technician_id" | "status">,
  userId: string | undefined,
  permissoes: TPermissoes
): TVisitEditMode {
  if (permissoes.canRegister && permissoes.canManageAll) return "tudo";
  const isDono = !!userId && visita.technician_id === userId;
  if (!permissoes.canRegister || !isDono || isVisitaEncerrada(visita.status)) return "leitura";
  return "relatorio";
}

export const buildTechnicianNames = (visita: Pick<TTechnicalVisit, "technician" | "technician2">): string =>
  [visita.technician?.display_name, visita.technician2?.display_name].filter(Boolean).join(" e ");
