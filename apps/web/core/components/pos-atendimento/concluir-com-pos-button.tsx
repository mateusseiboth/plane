/**
 * "Concluir e fazer pós-atendimento" no detalhe do chamado: move o chamado para a
 * etapa de conclusão do sistema e abre o formulário em seguida. A transição passa
 * pela matriz de etapas da API; se ela recusar, o formulário não abre.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { PhoneCall } from "lucide-react";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { findCompletedStateId, isConcluirComPosVisivel } from "@/components/pos-atendimento/helpers";
import { PosAtendimentoModal } from "@/components/pos-atendimento/pos-atendimento-modal";
import type { TPosApiError } from "@/components/pos-atendimento/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { usePosPermissions } from "@/hooks/use-pos-atendimento";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  /** Ex.: "Chamado SIARH-7: Folha travada". */
  titulo: string;
};

const ROTULO = "Concluir e fazer pós-atendimento";

export const ConcluirComPosButton = observer(function ConcluirComPosButton(props: Props) {
  const { workspaceSlug, projectId, issueId, titulo } = props;
  const { isMobile } = usePlatformOS();
  const { canRecord } = usePosPermissions(workspaceSlug);
  const {
    issue: { getIssueById },
    updateIssue,
  } = useIssueDetail();
  const { getStateById, getProjectStates } = useProjectState();
  const [isFormAberto, setFormAberto] = useState(false);
  const [saving, setSaving] = useState(false);

  const issue = getIssueById(issueId);
  const stateGroup = getStateById(issue?.state_id)?.group;
  const isVisivel = isConcluirComPosVisivel({ stateGroup, canRecord });

  const onConcluir = async () => {
    const stateId = findCompletedStateId(getProjectStates(projectId) ?? []);
    if (!stateId) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Este sistema não tem etapa de conclusão." });
      return;
    }
    setSaving(true);
    try {
      await updateIssue(workspaceSlug, projectId, issueId, { state_id: stateId });
      setFormAberto(true);
    } catch (erro) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível concluir o chamado.",
        message: (erro as TPosApiError)?.detail,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {isVisivel && (
        <Tooltip tooltipContent={ROTULO} isMobile={isMobile}>
          <IconButton
            variant="secondary"
            size="lg"
            icon={PhoneCall}
            onClick={onConcluir}
            disabled={saving}
            aria-label={ROTULO}
          />
        </Tooltip>
      )}
      {isFormAberto && (
        <PosAtendimentoModal
          workspaceSlug={workspaceSlug}
          origem="issue"
          alvoId={issueId}
          titulo={titulo}
          onClose={() => setFormAberto(false)}
        />
      )}
    </>
  );
});
