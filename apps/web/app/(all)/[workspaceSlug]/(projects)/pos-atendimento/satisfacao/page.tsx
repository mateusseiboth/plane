/**
 * Relatório de satisfação do pós-atendimento (`report.view`).
 */
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { SatisfacaoRelatorio } from "@/components/pos-atendimento/satisfacao-relatorio";
import { useWorkspace } from "@/hooks/store/use-workspace";

function SatisfacaoPage() {
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  const titulo = currentWorkspace?.name
    ? `${currentWorkspace.name} - Relatório de satisfação`
    : "Relatório de satisfação";

  return (
    <>
      <PageHead title={titulo} />
      <SatisfacaoRelatorio workspaceSlug={workspaceSlug?.toString() ?? ""} />
    </>
  );
}

export default observer(SatisfacaoPage);
