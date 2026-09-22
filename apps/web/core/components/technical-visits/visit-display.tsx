/**
 * Peças de exibição da visita usadas pela lista, pelo detalhe e pela impressão.
 */
import { cn } from "@plane/utils";
import { VISIT_STATUS } from "./visit-rules";

export const VISIT_STATUS_OPTIONS = [
  { value: VISIT_STATUS.AGENDADA, label: "Agendada" },
  { value: VISIT_STATUS.EM_ANDAMENTO, label: "Em Andamento" },
  { value: VISIT_STATUS.RELATORIO, label: "Relatório" },
  { value: VISIT_STATUS.AGUARDANDO_ASSINATURA, label: "Aguard. Assinatura" },
  { value: VISIT_STATUS.CONCLUIDA, label: "Concluída" },
  { value: VISIT_STATUS.CANCELADA, label: "Cancelada" },
] as const;

const STATUS_COLORS: Record<number, string> = {
  [VISIT_STATUS.AGENDADA]: "bg-blue-100 text-blue-800",
  [VISIT_STATUS.EM_ANDAMENTO]: "bg-yellow-100 text-yellow-800",
  [VISIT_STATUS.RELATORIO]: "bg-purple-100 text-purple-800",
  [VISIT_STATUS.AGUARDANDO_ASSINATURA]: "bg-orange-100 text-orange-800",
  [VISIT_STATUS.CONCLUIDA]: "bg-green-100 text-green-800",
  [VISIT_STATUS.CANCELADA]: "bg-red-100 text-red-800",
};

/** Os 6 motivos do relatório, na ordem do SAC. */
export const VISIT_MOTIVOS = [
  { key: "mot_commercial", label: "Comercial" },
  { key: "mot_update", label: "Atualização" },
  { key: "mot_bug_fix", label: "Correção de erros" },
  { key: "mot_training", label: "Acompanhamento ou treinamento" },
  { key: "mot_improvement", label: "Solicitação de melhoria" },
  { key: "mot_other", label: "Outros" },
] as const;

export type TVisitMotivoKey = (typeof VISIT_MOTIVOS)[number]["key"];

export function VisitStatusBadge({ status, label }: { status: number; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-11 font-medium",
        STATUS_COLORS[status] ?? "bg-surface-2 text-secondary"
      )}
    >
      {label}
    </span>
  );
}

export function VisitOverdueBadge() {
  return <span className="rounded-full bg-danger-primary px-2 py-0.5 text-11 font-medium text-white">Vencida</span>;
}

/** Mensagem da API embaixo do campo recusado. */
export function VisitFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-11 text-danger-primary">{message}</p>;
}

export const INPUT_CLASS =
  "w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 outline-none focus:border-accent-primary disabled:opacity-60";

export function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null;
}

export const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
