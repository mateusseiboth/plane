/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// types
import { PROJECT_ERROR_MESSAGES } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDeDupeIssue, TIssue } from "@plane/types";
// ui
import { AlertModalCore } from "@plane/ui";
// constants
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { isIssueDeleteAllowed } from "@/lib/permissoes/regras-de-chamado";
// plane-web

const ISSUE_DELETE_DENIED = { i18n_title: "common.error.label", i18n_message: "issue.delete.permission_denied" };
// Corpo do 403 do api-ts quando a função não tem a ação (DENIED em utils/permission-checks.ts).
const API_DENIAL_DETAIL = "Sua função não permite esta ação.";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  dataId?: string | null | undefined;
  data?: TIssue | TDeDupeIssue;
  isSubIssue?: boolean;
  onSubmit?: () => Promise<void>;
  isEpic?: boolean;
};

export const DeleteIssueModal = observer(function DeleteIssueModal(props: Props) {
  const { dataId, data, isOpen, handleClose, isSubIssue = false, onSubmit, isEpic = false } = props;
  // states
  const [isDeleting, setIsDeleting] = useState(false);
  // store hooks
  const { workspaceSlug } = useParams();
  const { issueMap } = useIssues();
  const { getProjectById } = useProject();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug?.toString());
  const { t } = useTranslation();

  const { data: currentUser } = useUser();

  useEffect(() => {
    setIsDeleting(false);
  }, [isOpen]);

  if (!dataId && !data) return null;

  // derived values
  const issue = data ? data : issueMap[dataId!];
  const projectDetails = getProjectById(issue?.project_id);
  const isIssueCreator = issue?.created_by === currentUser?.id;

  // Excluir: issue.delete.all, ou issue.delete.own para quem abriu o chamado (a mesma regra do DELETE no api-ts).
  const authorized = isIssueDeleteAllowed((action) => canInProject(action, projectDetails?.id), isIssueCreator);

  const onClose = () => {
    setIsDeleting(false);
    handleClose();
  };

  const handleIssueDelete = async () => {
    setIsDeleting(true);

    if (!authorized) {
      setToast({
        title: t(ISSUE_DELETE_DENIED.i18n_title),
        type: TOAST_TYPE.ERROR,
        message: t(ISSUE_DELETE_DENIED.i18n_message),
      });
      onClose();
      return;
    }
    if (onSubmit)
      await onSubmit()
        .then(() => {
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("common.success"),
            message: t("entity.delete.success", {
              entity: isSubIssue ? t("common.sub_work_item") : isEpic ? t("common.epic") : t("common.work_item"),
            }),
          });
          onClose();
        })
        .catch((errors) => {
          const isPermissionError = errors?.detail === API_DENIAL_DETAIL;
          const currentError = isPermissionError ? ISSUE_DELETE_DENIED : PROJECT_ERROR_MESSAGES.issueDeleteError;
          setToast({
            title: t(currentError.i18n_title),
            type: TOAST_TYPE.ERROR,
            message: currentError.i18n_message && t(currentError.i18n_message),
          });
        })
        .finally(() => onClose());
  };

  return (
    <AlertModalCore
      handleClose={onClose}
      handleSubmit={handleIssueDelete}
      isSubmitting={isDeleting}
      isOpen={isOpen}
      title={t("entity.delete.label", { entity: isEpic ? t("common.epic") : t("common.work_item") })}
      content={
        <>
          {/* TODO: Translate here */}
          {`Tem certeza de que deseja excluir ${isEpic ? "o épico" : "o chamado"} `}
          <span className="font-medium break-words text-primary">
            {projectDetails?.identifier}-{issue?.sequence_id}
          </span>
          {` ? Todos os dados relacionados ${isEpic ? "ao épico" : "ao chamado"} serão removidos permanentemente. Esta ação não pode ser desfeita.`}
        </>
      }
    />
  );
});
