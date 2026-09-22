/**
 * Fila do pós-atendimento. Quem registra ou verifica vê; a API confere de novo.
 */
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { PosFila } from "@/components/pos-atendimento/pos-fila";
import { useWorkspace } from "@/hooks/store/use-workspace";

function PosAtendimentoPage() {
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  const titulo = currentWorkspace?.name ? `${currentWorkspace.name} - Pós-atendimento` : "Pós-atendimento";

  return (
    <>
      <PageHead title={titulo} />
      <PosFila workspaceSlug={workspaceSlug?.toString() ?? ""} />
    </>
  );
}

export default observer(PosAtendimentoPage);
