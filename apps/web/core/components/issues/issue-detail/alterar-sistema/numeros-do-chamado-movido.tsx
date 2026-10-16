/**
 * Selos do número do chamado no cabeçalho do detalhe, com o "Alterar sistema":
 * no chamado antigo o selo vira link para o novo ("Movido para SIART-123"); no
 * novo, um selo leva de volta ao antigo ("Veio de INTEG1-24").
 */
import { observer } from "mobx-react";
import Link from "next/link";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssue } from "@plane/types";
import { NumerosDoChamado } from "@/components/issues/numeros-do-chamado";
import {
  buildDicaDoChamadoMovido,
  buildLinkDoChamadoMovido,
} from "@/components/issues/issue-detail/alterar-sistema/alterar-sistema.rules";

type Props = {
  workspaceSlug: string;
  issue: Pick<TIssue, "ticket_number" | "legacy_ticket_number" | "moved_to_issue" | "moved_from_issue">;
};

const SELO_DE_ORIGEM = "shrink-0 rounded px-1.5 py-0.5 text-10 font-semibold bg-layer-1 text-secondary hover:underline";

export const NumerosDoChamadoMovido = observer(function NumerosDoChamadoMovido({ workspaceSlug, issue }: Props) {
  const { moved_to_issue: novo, moved_from_issue: antigo } = issue;
  return (
    <>
      {novo ? (
        <Tooltip tooltipContent={buildDicaDoChamadoMovido("para", novo)} position="top">
          <Link
            href={buildLinkDoChamadoMovido(workspaceSlug, novo)}
            className="inline-flex items-center gap-1 rounded hover:opacity-80"
          >
            <NumerosDoChamado issue={issue} className="cursor-pointer" />
            <span className="text-10 font-semibold text-accent-primary">{buildDicaDoChamadoMovido("para", novo)}</span>
          </Link>
        </Tooltip>
      ) : (
        <NumerosDoChamado issue={issue} />
      )}
      {antigo && (
        <Link href={buildLinkDoChamadoMovido(workspaceSlug, antigo)} className={SELO_DE_ORIGEM}>
          {buildDicaDoChamadoMovido("de", antigo)}
        </Link>
      )}
    </>
  );
});
