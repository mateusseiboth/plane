/**
 * Painel do pós-atendimento no detalhe do chamado e da visita: mostra o que foi
 * registrado; concluído e sem pós, oferece o registro a quem tem
 * `posatendimento.record`; pendente de verificação, oferece a verificação.
 */
import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { PosAtendimentoModal } from "@/components/pos-atendimento/pos-atendimento-modal";
import { PosDetalhes, PosSituacaoBadge } from "@/components/pos-atendimento/pos-display";
import type { TPosOrigem } from "@/components/pos-atendimento/types";
import { VerificarPosModal } from "@/components/pos-atendimento/verificar-modal";
import { usePosPainel, usePosPermissions } from "@/hooks/use-pos-atendimento";

type Props = {
  workspaceSlug: string;
  origem: TPosOrigem;
  alvoId: string;
  titulo: string;
  /** Muda quando o alvo muda de etapa (ex.: `state_id`), para o painel reler. */
  versao?: string | number | null;
  className?: string;
};

const BOTAO =
  "rounded border border-subtle px-3 py-1.5 text-13 text-secondary hover:border-accent-primary hover:text-accent-primary";

export function PosAtendimentoPanel({ workspaceSlug, origem, alvoId, titulo, versao, className }: Props) {
  const { data } = usePosPainel(workspaceSlug, origem, alvoId, versao);
  const { canRecord, canVerify } = usePosPermissions(workspaceSlug);
  const [modal, setModal] = useState<"registrar" | "verificar" | null>(null);

  const pos = data?.pos ?? null;
  const isPendente = !!data?.concluido && !pos && canRecord;
  if (!pos && !isPendente) return null;

  return (
    <div className={className}>
      <div className="rounded-lg border border-subtle bg-surface-1 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-secondary" />
            <h3 className="text-13 font-semibold">Pós-atendimento</h3>
            {pos && <PosSituacaoBadge situacao={pos.situacao} label={pos.situacao_label} />}
          </div>
          {isPendente && (
            <button type="button" className={BOTAO} onClick={() => setModal("registrar")}>
              Fazer pós-atendimento
            </button>
          )}
          {pos?.situacao === "to_verify" && canVerify && (
            <button type="button" className={BOTAO} onClick={() => setModal("verificar")}>
              Verificar
            </button>
          )}
        </div>
        {pos ? <PosDetalhes pos={pos} /> : <p className="text-13 text-secondary">Pós-atendimento pendente.</p>}
      </div>
      {modal === "registrar" && (
        <PosAtendimentoModal
          workspaceSlug={workspaceSlug}
          origem={origem}
          alvoId={alvoId}
          titulo={titulo}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "verificar" && pos && (
        <VerificarPosModal
          workspaceSlug={workspaceSlug}
          pos={pos}
          titulo={titulo}
          canVerify={canVerify}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
