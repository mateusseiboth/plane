/**
 * Selos com o número anual do chamado ("12-2026") e, quando for outro número,
 * o número legado do SAC. Fonte única dos dois selos em lista, quadro,
 * planilha e detalhe: a regra de quando mostrar o legado mora em
 * `getNumerosDoChamado` (@plane/utils).
 */
import type { TIssue } from "@plane/types";
import { cn, getNumerosDoChamado } from "@plane/utils";

type Props = {
  issue: Pick<TIssue, "ticket_number" | "legacy_ticket_number">;
  className?: string;
};

const SELO = "shrink-0 rounded px-1.5 py-0.5 font-mono text-10 font-semibold";

export function NumerosDoChamado({ issue, className }: Props) {
  const { numero, legado } = getNumerosDoChamado(issue);
  if (!numero && !legado) return null;

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1", className)}>
      {numero && (
        <span className={cn(SELO, "border border-subtle-1 bg-layer-1 text-secondary")} title="Número do chamado">
          #{numero}
        </span>
      )}
      {legado && (
        <span
          className={cn(SELO, "bg-amber-100 text-amber-800 ring-amber-300 ring-1")}
          title="Número no sistema antigo"
        >
          #{legado}
        </span>
      )}
    </span>
  );
}
