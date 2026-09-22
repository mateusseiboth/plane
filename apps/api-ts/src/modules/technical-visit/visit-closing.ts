/**
 * Trava de encerramento da visita. Sem banco: recebe a visita já com o que o
 * PATCH vai gravar e os chamados vinculados já resolvidos.
 *
 * Vale ao concluir e ao mandar para assinatura: o relatório impresso para
 * assinar é o mesmo que encerra a visita quando volta assinado.
 */
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";

export type VisitaParaEncerrar = {
  startedAt: Date | null;
  finishedAt: Date | null;
  summary: string | null;
  conclusion: string | null;
  motUpdate: boolean;
  motBugFix: boolean;
  motTraining: boolean;
  motImprovement: boolean;
  motCommercial: boolean;
  motOther: boolean;
};

export type ChamadoVinculado = { codigo: string; isOpen: boolean };

/** Erro que volta para o campo do formulário (`path` é o nome do campo na API). */
export type VisitFieldError = { path: string; message: string };

const STATUS_QUE_ENCERRAM: ReadonlySet<number> = new Set([VISIT_STATUS.AGUARDANDO_ASSINATURA, VISIT_STATUS.CONCLUIDA]);

const GRUPOS_ENCERRADOS: ReadonlySet<string> = new Set(["completed", "cancelled"]);

const MOTIVOS = ["motUpdate", "motBugFix", "motTraining", "motImprovement", "motCommercial", "motOther"] as const;

export const requiresClosingCheck = (status: number): boolean => STATUS_QUE_ENCERRAM.has(status);

/** Chamado sem etapa conta como aberto: ninguém o concluiu. */
export const isChamadoAberto = (grupoDaEtapa: string | null | undefined): boolean =>
  !GRUPOS_ENCERRADOS.has(grupoDaEtapa ?? "");

/** O editor grava `<p></p>` para um campo que ninguém preencheu. */
export const isTextoVazio = (html: string | null | undefined): boolean =>
  (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim() === "";

const hasMotivo = (visita: VisitaParaEncerrar): boolean => MOTIVOS.some((motivo) => visita[motivo]);

const isFimAntesDoInicio = (visita: VisitaParaEncerrar): boolean =>
  !!visita.startedAt && !!visita.finishedAt && visita.finishedAt.getTime() < visita.startedAt.getTime();

type Regra = { path: string; message: string; isMissing: (visita: VisitaParaEncerrar) => boolean };

// A ordem é a do formulário: é nela que a tela mostra os erros.
const REGRAS: readonly Regra[] = [
  { path: "started_at", message: "Informe a data e a hora de início.", isMissing: (v) => !v.startedAt },
  { path: "finished_at", message: "Informe a data e a hora de fim.", isMissing: (v) => !v.finishedAt },
  { path: "finished_at", message: "O fim deve ser depois do início.", isMissing: isFimAntesDoInicio },
  { path: "summary", message: "Informe o resumo da visita.", isMissing: (v) => isTextoVazio(v.summary) },
  { path: "conclusion", message: "Informe a conclusão da visita.", isMissing: (v) => isTextoVazio(v.conclusion) },
  { path: "motivos", message: "Marque ao menos um motivo da visita.", isMissing: (v) => !hasMotivo(v) },
];

const findChamadosAbertos = (chamados: readonly ChamadoVinculado[]): VisitFieldError[] => {
  const abertos = chamados.filter((c) => c.isOpen).map((c) => c.codigo);
  if (!abertos.length) return [];
  return [{ path: "issues", message: `Conclua os chamados vinculados antes de encerrar: ${abertos.join(", ")}.` }];
};

export function findClosingErrors(
  visita: VisitaParaEncerrar,
  chamados: readonly ChamadoVinculado[]
): VisitFieldError[] {
  const campos = REGRAS.filter((regra) => regra.isMissing(visita)).map(({ path, message }) => ({ path, message }));
  return [...campos, ...findChamadosAbertos(chamados)];
}
