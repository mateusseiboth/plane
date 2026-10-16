/**
 * Botão "Alterar sistema" da linha de ações do detalhe do chamado. Aparece só
 * para quem tem `issue.change_system` (matriz de ações) e só enquanto o
 * chamado ainda não foi movido.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { ArrowRightLeft } from "lucide-react";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { IssueDetailWidgetButton } from "@/components/issues/issue-detail-widgets/widget-button";
import { AlterarSistemaModal } from "@/components/issues/issue-detail/alterar-sistema/alterar-sistema-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

export const AlterarSistemaActionButton = observer(function AlterarSistemaActionButton(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const [isOpen, setIsOpen] = useState(false);
  const { canInProject } = useMyWorkspaceActions(workspaceSlug);
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const issue = getIssueById(issueId);

  if (!canInProject("issue.change_system", projectId) || issue?.moved_to_issue) return null;

  return (
    <>
      <IssueDetailWidgetButton
        title="Alterar sistema"
        icon={<ArrowRightLeft className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2} />}
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      />
      <AlterarSistemaModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
});
