/**
 * Quem pode mexer em quê numa visita, depois de a rota já ter exigido
 * `visit.manage` pela matriz. Sem banco e sem número de papel:
 *
 * - `visit.manage.all` (quem gerencia): troca técnico e data, cancela, exclui e
 *   edita qualquer relatório, inclusive de visita encerrada.
 * - o técnico da visita (`technicianId`): preenche o relatório da própria visita.
 *
 * No SAC era igual: só a gestão de projetos cancelava e trocava técnico ou data,
 * e só o técnico da visita editava o relatório.
 */
import { instanteDaEntrada } from "@utils/prazo";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";

export type VisitActor = { userId: string; canManageAll: boolean };

export type VisitaAtual = { technicianId: string | null; scheduledDate: Date | null; status: number };

export type VisitDenial = { status: 403 | 409; message: string };

const ENCERRADAS: ReadonlySet<number> = new Set([VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA]);

const CAMPOS_DE_AGENDA = ["technician_id", "scheduled_date"] as const;

export const isVisitaEncerrada = (status: number): boolean => ENCERRADAS.has(status);

export const isVisitOwner = (visita: VisitaAtual, userId: string): boolean => visita.technicianId === userId;

const readInstante = (valor: unknown): number | null => instanteDaEntrada(valor, "inicio")?.getTime() ?? null;

const isTrocaDeTecnico = (patch: Record<string, unknown>, visita: VisitaAtual): boolean =>
  "technician_id" in patch && (patch.technician_id || null) !== visita.technicianId;

const isTrocaDeData = (patch: Record<string, unknown>, visita: VisitaAtual): boolean =>
  "scheduled_date" in patch && readInstante(patch.scheduled_date) !== (visita.scheduledDate?.getTime() ?? null);

const isCancelamento = (patch: Record<string, unknown>, visita: VisitaAtual): boolean =>
  patch.status === VISIT_STATUS.CANCELADA && visita.status !== VISIT_STATUS.CANCELADA;

export const isSchedulingChange = (patch: Record<string, unknown>, visita: VisitaAtual): boolean =>
  isTrocaDeTecnico(patch, visita) || isTrocaDeData(patch, visita) || isCancelamento(patch, visita);

/** Qualquer campo além da agenda e do cancelamento é relatório. */
export const isReportChange = (patch: Record<string, unknown>): boolean =>
  Object.keys(patch).some(
    (campo) =>
      !(CAMPOS_DE_AGENDA as readonly string[]).includes(campo) &&
      !(campo === "status" && patch.status === VISIT_STATUS.CANCELADA)
  );

const ENCERRADA: VisitDenial = {
  status: 409,
  message: "Visita encerrada. Somente quem gerencia visitas pode alterá-la.",
};
const SO_GESTAO: VisitDenial = {
  status: 403,
  message: "Somente quem gerencia visitas troca o técnico, a data ou cancela a visita.",
};
const SO_O_TECNICO: VisitDenial = { status: 403, message: "Somente o técnico da visita preenche o relatório." };

type Guarda = {
  deny: VisitDenial;
  when: (patch: Record<string, unknown>, visita: VisitaAtual, actor: VisitActor) => boolean;
};

// Primeira guarda que casa decide. Quem gerencia passa por todas.
const GUARDAS: readonly Guarda[] = [
  { deny: ENCERRADA, when: (_p, visita, actor) => !actor.canManageAll && isVisitaEncerrada(visita.status) },
  { deny: SO_GESTAO, when: (patch, visita, actor) => !actor.canManageAll && isSchedulingChange(patch, visita) },
  {
    deny: SO_O_TECNICO,
    when: (patch, visita, actor) => !actor.canManageAll && !isVisitOwner(visita, actor.userId) && isReportChange(patch),
  },
];

export function findVisitDenial(
  patch: Record<string, unknown>,
  visita: VisitaAtual,
  actor: VisitActor
): VisitDenial | null {
  return GUARDAS.find((guarda) => guarda.when(patch, visita, actor))?.deny ?? null;
}

/** Vincular chamado e anexar arquivo são parte do relatório. */
export const findReportDenial = (visita: VisitaAtual, actor: VisitActor): VisitDenial | null =>
  findVisitDenial({ relatorio: true }, visita, actor);
