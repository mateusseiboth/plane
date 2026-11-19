/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { Clock, FileStack, MoreHorizontal, MoveRight } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { IconButton, getIconButtonStyling } from "@plane/propel/icon-button";
import {
  LinkIcon,
  CopyIcon,
  NewTabIcon,
  TrashIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleFilledIcon,
  CloseCircleFilledIcon,
} from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TNameDescriptionLoader } from "@plane/types";
import { EInboxIssueStatus } from "@plane/types";
import { ControlLink, CustomMenu, Row } from "@plane/ui";
import { copyUrlToClipboard, findHowManyDaysLeft, generateWorkItemLink } from "@plane/utils";
// components
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { NameDescriptionUpdateStatus } from "@/components/issues/issue-update-status";
import { IntakePrintAction } from "@/components/print";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectInbox } from "@/hooks/store/use-project-inbox";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUser } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { ACAO_DE_TRIAGEM, isTriagemPermitida } from "./triagem-permitida";
import { useAppRouter } from "@/hooks/use-app-router";
// store
import type { IInboxIssueStore } from "@/store/inbox/inbox-issue.store";
// local imports
import { InboxIssueStatus } from "../inbox-issue-status";
import { DeclineIssueModal } from "@/components/inbox/modals/decline-issue-modal";
import { NaoAtendidoModal } from "@/components/inbox/modals/nao-atendido-modal";
import { EncerrarNoAtendimentoModal } from "@/components/inbox/modals/encerrar-no-atendimento-modal";
import { isDecisaoNoAtendimento } from "@/components/inbox/content/decisao-no-atendimento";
import { isConfirmacaoDoAtendimento } from "@/components/inbox/content/confirmacao-do-atendimento";
import { DeleteInboxIssueModal } from "../modals/delete-issue-modal";
import { SelectDuplicateInboxIssueModal } from "../modals/select-duplicate";
import { InboxIssueSnoozeModal } from "../modals/snooze-issue-modal";
import { InboxIssueActionsMobileHeader } from "./inbox-issue-mobile-header";

type TInboxIssueActionsHeader = {
  workspaceSlug: string;
  projectId: string;
  inboxIssue: IInboxIssueStore | undefined;
  isSubmitting: TNameDescriptionLoader;
  isMobileSidebar: boolean;
  setIsMobileSidebar: (value: boolean) => void;
  isNotificationEmbed: boolean;
  embedRemoveCurrentNotification?: () => void;
};

export const InboxIssueActionsHeader = observer(function InboxIssueActionsHeader(props: TInboxIssueActionsHeader) {
  const {
    workspaceSlug,
    projectId,
    inboxIssue,
    isSubmitting,
    isMobileSidebar,
    setIsMobileSidebar,
    isNotificationEmbed = false,
    embedRemoveCurrentNotification,
  } = props;
  // states
  const [isSnoozeDateModalOpen, setIsSnoozeDateModalOpen] = useState(false);
  const [selectDuplicateIssue, setSelectDuplicateIssue] = useState(false);
  const [acceptIssueModal, setAcceptIssueModal] = useState(false);
  const [declineIssueModal, setDeclineIssueModal] = useState(false);
  const [naoAtendidoModal, setNaoAtendidoModal] = useState(false);
  const [encerrarModal, setEncerrarModal] = useState(false);
  const [deleteIssueModal, setDeleteIssueModal] = useState(false);
  // store
  const { currentTab, deleteInboxIssue, filteredInboxIssueIds } = useProjectInbox();
  const { data: currentUser } = useUser();
  const { getPartialProjectById } = useProject();
  const currentProjectDetails = getPartialProjectById(projectId);
  const { t } = useTranslation();

  const router = useAppRouter();
  const { getProjectById } = useProject();

  const issue = inboxIssue?.issue;
  // derived values
  // Triar (aceitar, recusar, adiar, duplicar) é a ação `intake.review` da
  // matriz, a mesma que o servidor confere: nada de nível fixo de papel aqui.
  const { can } = useMyWorkspaceActions(workspaceSlug);
  const podeTriar = isTriagemPermitida({ can, status: inboxIssue?.status });
  const isCreator = issue?.created_by === currentUser?.id;
  // Excluir: quem exclui qualquer chamado, ou quem abriu este.
  const canDelete = can("issue.delete.all") || isCreator;
  // O menu de mais ações reúne triagem e exclusão.
  const isAllowed = can(ACAO_DE_TRIAGEM) || canDelete;
  const canMarkAsDuplicate = podeTriar;
  const canMarkAsAccepted = podeTriar;
  const canMarkAsDeclined = podeTriar;
  // Quem chegou até os botões já passou pela matriz; o guard por clique fica só
  // como rede para o caso de a configuração mudar com a tela aberta.
  const isProjectAdmin = podeTriar;
  const isAcceptedOrDeclined = inboxIssue?.status ? [-1, 1, 2, 3].includes(inboxIssue.status) : undefined;
  // ── "Atendido" / "Não atendido": a Qualidade concluiu, o atendimento confirma ──
  const { getStateById } = useProjectState();
  const canConfirmarAtendimento = isConfirmacaoDoAtendimento({
    status: inboxIssue?.status,
    grupo: getStateById(issue?.state_id)?.group,
    isQuemAbriu: isCreator,
    can,
  });
  // days left for snooze
  const numberOfDaysLeft = findHowManyDaysLeft(inboxIssue?.snoozed_till);

  const currentInboxIssueId = inboxIssue?.issue?.id;

  const redirectIssue = (): string | undefined => {
    let nextOrPreviousIssueId: string | undefined = undefined;
    const currentIssueIndex = filteredInboxIssueIds.findIndex((id) => id === currentInboxIssueId);
    if (filteredInboxIssueIds[currentIssueIndex + 1])
      nextOrPreviousIssueId = filteredInboxIssueIds[currentIssueIndex + 1];
    else if (filteredInboxIssueIds[currentIssueIndex - 1])
      nextOrPreviousIssueId = filteredInboxIssueIds[currentIssueIndex - 1];
    else nextOrPreviousIssueId = undefined;
    return nextOrPreviousIssueId;
  };

  const handleRedirection = (nextOrPreviousIssueId: string | undefined) => {
    if (!isNotificationEmbed) {
      if (nextOrPreviousIssueId)
        router.push(
          `/${workspaceSlug}/projects/${projectId}/intake?currentTab=${currentTab}&inboxIssueId=${nextOrPreviousIssueId}`
        );
      else router.push(`/${workspaceSlug}/projects/${projectId}/intake?currentTab=${currentTab}`);
    }
  };

  const handleInboxIssueAccept = async () => {
    const nextOrPreviousIssueId = redirectIssue();
    await inboxIssue?.updateInboxIssueStatus(EInboxIssueStatus.ACCEPTED);
    setAcceptIssueModal(false);
    handleRedirection(nextOrPreviousIssueId);
  };

  // A recusa do servidor (motivo curto, função sem permissão) sobe para o modal
  // mostrar no campo; só a recusa aceita fecha e segue para a próxima.
  const handleInboxIssueDecline = async (motivo: string) => {
    const nextOrPreviousIssueId = redirectIssue();
    await inboxIssue?.declineInboxIssue(motivo);
    setDeclineIssueModal(false);
    handleRedirection(nextOrPreviousIssueId);
  };

  // "Atendido": closes the accepted chamado (moves it to the Closed tab).
  const handleMarkFulfilled = async () => {
    try {
      await inboxIssue?.updateInboxIssueStatus(EInboxIssueStatus.FULFILLED);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Solicitação atendida",
        message: "A solicitação foi marcada como atendida.",
      });
    } catch (err: unknown) {
      const error = err as { detail?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: error?.detail || "Não foi possível marcar como atendido.",
      });
    }
  };

  // No atendimento (portal, ouvidoria): o Atendimento encaminha ou encerra.
  const canDecidirNoAtendimento = isDecisaoNoAtendimento({ status: inboxIssue?.status, can });
  const handleEncaminhar = async () => {
    try {
      await inboxIssue?.sendParaATriagem();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Encaminhada para a triagem", message: "A Qualidade foi avisada." });
    } catch (err: unknown) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível encaminhar",
        message: (err as { detail?: string })?.detail ?? "Tente de novo.",
      });
    }
  };
  const handleEncerrar = async (respostaHtml: string) => {
    await inboxIssue?.closeNoAtendimento(respostaHtml);
    setEncerrarModal(false);
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Encerrada no atendimento",
      message: "Quem pediu recebeu a resposta.",
    });
  };

  // "Não atendido": o chamado volta para a triagem com o motivo. A recusa do
  // servidor sobe para o modal mostrar no campo.
  const handleNaoAtendido = async (motivo: string) => {
    await inboxIssue?.markNaoAtendido(motivo);
    setNaoAtendidoModal(false);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Devolvida para a triagem", message: "A Qualidade foi avisada." });
  };

  const handleInboxIssueSnooze = async (date: Date) => {
    const nextOrPreviousIssueId = redirectIssue();
    await inboxIssue?.updateInboxIssueSnoozeTill(date);
    setIsSnoozeDateModalOpen(false);
    handleRedirection(nextOrPreviousIssueId);
  };

  const handleInboxIssueDuplicate = async (issueId: string) => {
    await inboxIssue?.updateInboxIssueDuplicateTo(issueId);
  };

  const handleInboxIssueDelete = async () => {
    if (!inboxIssue || !currentInboxIssueId) return;
    await deleteInboxIssue(workspaceSlug, projectId, currentInboxIssueId).then(() => {
      if (!isNotificationEmbed) router.push(`/${workspaceSlug}/projects/${projectId}/intake`);
    });
  };

  const handleIssueSnoozeAction = async () => {
    if (inboxIssue?.snoozed_till && numberOfDaysLeft && numberOfDaysLeft > 0) {
      const nextOrPreviousIssueId = redirectIssue();
      await inboxIssue?.updateInboxIssueSnoozeTill(undefined);
      handleRedirection(nextOrPreviousIssueId);
    } else {
      setIsSnoozeDateModalOpen(true);
    }
  };

  const handleCopyIssueLink = (path: string) =>
    copyUrlToClipboard(path).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.link_copied"),
        message: t("common.copied_to_clipboard"),
      })
    );

  const currentIssueIndex = filteredInboxIssueIds.findIndex((issueId) => issueId === currentInboxIssueId) ?? 0;

  const handleInboxIssueNavigation = useCallback(
    (direction: "next" | "prev") => {
      if (!filteredInboxIssueIds || !currentInboxIssueId) return;
      const activeElement = document.activeElement as HTMLElement;
      if (activeElement && (activeElement.classList.contains("tiptap") || activeElement.id === "title-input")) return;
      const nextIssueIndex =
        direction === "next"
          ? (currentIssueIndex + 1) % filteredInboxIssueIds.length
          : (currentIssueIndex - 1 + filteredInboxIssueIds.length) % filteredInboxIssueIds.length;
      const nextIssueId = filteredInboxIssueIds[nextIssueIndex];
      if (!nextIssueId) return;
      router.push(`/${workspaceSlug}/projects/${projectId}/intake?inboxIssueId=${nextIssueId}`);
    },
    [currentInboxIssueId, currentIssueIndex, filteredInboxIssueIds, projectId, router, workspaceSlug]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        handleInboxIssueNavigation("prev");
      } else if (e.key === "ArrowDown") {
        handleInboxIssueNavigation("next");
      }
    },
    [handleInboxIssueNavigation]
  );

  const handleActionWithPermission = (isAdmin: boolean, action: () => void, errorMessage: string) => {
    if (isAdmin) action();
    else {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Permissão negada",
        message: errorMessage,
      });
    }
  };

  useEffect(() => {
    if (isSubmitting === "submitting") return;
    if (!isNotificationEmbed) document.addEventListener("keydown", onKeyDown);
    return () => {
      if (!isNotificationEmbed) document.removeEventListener("keydown", onKeyDown);
    };
  }, [onKeyDown, isNotificationEmbed, isSubmitting]);

  if (!inboxIssue) return null;

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString(),
    projectId: issue?.project_id,
    issueId: currentInboxIssueId,
    projectIdentifier: currentProjectDetails?.identifier,
    sequenceId: issue?.sequence_id,
  });

  return (
    <>
      <>
        <SelectDuplicateInboxIssueModal
          isOpen={selectDuplicateIssue}
          onClose={() => setSelectDuplicateIssue(false)}
          value={inboxIssue?.duplicate_to}
          onSubmit={handleInboxIssueDuplicate}
        />
        <CreateUpdateIssueModal
          data={inboxIssue?.issue}
          isOpen={acceptIssueModal}
          onClose={() => setAcceptIssueModal(false)}
          beforeFormSubmit={handleInboxIssueAccept}
          withDraftIssueWrapper={false}
          fetchIssueDetails={false}
          showActionItemsOnUpdate
          modalTitle={t("inbox_issue.actions.move", {
            value: `${currentProjectDetails?.identifier}-${issue?.sequence_id}`,
          })}
          primaryButtonText={{
            default: t("add_to_project"),
            loading: t("adding"),
          }}
        />
        <DeclineIssueModal
          data={inboxIssue?.issue || {}}
          isOpen={declineIssueModal}
          onClose={() => setDeclineIssueModal(false)}
          onSubmit={handleInboxIssueDecline}
        />
        <EncerrarNoAtendimentoModal
          data={inboxIssue?.issue || {}}
          isOpen={encerrarModal}
          onClose={() => setEncerrarModal(false)}
          onSubmit={handleEncerrar}
        />
        <NaoAtendidoModal
          data={inboxIssue?.issue || {}}
          isOpen={naoAtendidoModal}
          onClose={() => setNaoAtendidoModal(false)}
          onSubmit={handleNaoAtendido}
        />
        <DeleteInboxIssueModal
          data={inboxIssue?.issue}
          isOpen={deleteIssueModal}
          onClose={() => setDeleteIssueModal(false)}
          onSubmit={handleInboxIssueDelete}
        />
        <InboxIssueSnoozeModal
          isOpen={isSnoozeDateModalOpen}
          handleClose={() => setIsSnoozeDateModalOpen(false)}
          value={inboxIssue?.snoozed_till}
          onConfirm={handleInboxIssueSnooze}
        />
      </>

      <Row className="relative z-15 hidden h-full w-full items-center justify-between gap-2 border-b border-subtle bg-surface-1 lg:flex">
        <div className="flex items-center gap-4">
          {isNotificationEmbed && (
            <button onClick={embedRemoveCurrentNotification}>
              <MoveRight className="h-4 w-4 text-tertiary hover:text-secondary" />
            </button>
          )}
          {issue?.project_id && issue.sequence_id && (
            <h3 className="flex-shrink-0 text-14 font-medium text-tertiary">
              {getProjectById(issue.project_id)?.identifier}-{issue.sequence_id}
            </h3>
          )}
          <InboxIssueStatus inboxIssue={inboxIssue} iconSize={12} />
          <div className="flex w-full items-center justify-end">
            <NameDescriptionUpdateStatus isSubmitting={isSubmitting} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isNotificationEmbed && (
            <div className="flex items-center gap-x-2">
              <IconButton
                variant="secondary"
                size="lg"
                icon={ChevronUpIcon}
                aria-label="Solicitação anterior"
                onClick={() => handleInboxIssueNavigation("prev")}
              />
              <IconButton
                variant="secondary"
                size="lg"
                icon={ChevronDownIcon}
                aria-label="Próxima solicitação"
                onClick={() => handleInboxIssueNavigation("next")}
              />
            </div>
          )}

          <IntakePrintAction inboxIssue={inboxIssue} />

          <div className="flex flex-wrap items-center gap-2">
            {canMarkAsAccepted && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  handleActionWithPermission(
                    isProjectAdmin,
                    () => setAcceptIssueModal(true),
                    t("inbox_issue.errors.accept_permission")
                  )
                }
              >
                <CheckCircleFilledIcon className="size-4 shrink-0 text-success-secondary" />
                {t("inbox_issue.actions.accept")}
              </Button>
            )}

            {canMarkAsDeclined && (
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  handleActionWithPermission(
                    isProjectAdmin,
                    () => setDeclineIssueModal(true),
                    t("inbox_issue.errors.decline_permission")
                  )
                }
              >
                <CloseCircleFilledIcon className="size-4 shrink-0 text-danger-secondary" />
                {t("inbox_issue.actions.decline")}
              </Button>
            )}

            {canDecidirNoAtendimento && (
              <div className="flex items-center gap-2">
                <Button variant="primary" size="lg" onClick={() => void handleEncaminhar()}>
                  Encaminhar para a triagem
                </Button>
                <Button variant="secondary" size="lg" onClick={() => setEncerrarModal(true)}>
                  Encerrar no atendimento
                </Button>
              </div>
            )}

            {canConfirmarAtendimento && (
              <div className="flex items-center gap-2">
                <Button variant="primary" size="lg" onClick={handleMarkFulfilled}>
                  <CheckCircleFilledIcon className="size-4 shrink-0" />
                  Atendido
                </Button>
                <Button variant="secondary" size="lg" onClick={() => setNaoAtendidoModal(true)}>
                  <CloseCircleFilledIcon className="size-4 shrink-0 text-danger-secondary" />
                  Não atendido
                </Button>
              </div>
            )}

            {isAcceptedOrDeclined ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="lg"
                  prependIcon={<LinkIcon className="h-2.5 w-2.5" />}
                  onClick={() => handleCopyIssueLink(workItemLink)}
                >
                  {t("inbox_issue.actions.copy")}
                </Button>
                <ControlLink href={workItemLink} onClick={() => router.push(workItemLink)} target="_self">
                  <Button variant="secondary" size="lg" prependIcon={<NewTabIcon className="h-2.5 w-2.5" />}>
                    {t("inbox_issue.actions.open")}
                  </Button>
                </ControlLink>
              </div>
            ) : (
              <>
                {isAllowed && (
                  <CustomMenu
                    customButton={<MoreHorizontal className="size-4" />}
                    customButtonClassName={getIconButtonStyling("secondary", "lg")}
                    placement="bottom-start"
                  >
                    {canMarkAsAccepted && (
                      <CustomMenu.MenuItem
                        onClick={() =>
                          handleActionWithPermission(
                            isProjectAdmin,
                            handleIssueSnoozeAction,
                            t("inbox_issue.errors.snooze_permission")
                          )
                        }
                      >
                        <div className="flex items-center gap-2">
                          <Clock size={14} strokeWidth={2} />
                          {inboxIssue?.snoozed_till && numberOfDaysLeft && numberOfDaysLeft > 0
                            ? t("inbox_issue.actions.unsnooze")
                            : t("inbox_issue.actions.snooze")}
                        </div>
                      </CustomMenu.MenuItem>
                    )}
                    {canMarkAsDuplicate && (
                      <CustomMenu.MenuItem
                        onClick={() =>
                          handleActionWithPermission(
                            isProjectAdmin,
                            () => setSelectDuplicateIssue(true),
                            "Sua função não permite marcar a solicitação como duplicada."
                          )
                        }
                      >
                        <div className="flex items-center gap-2">
                          <FileStack size={14} strokeWidth={2} />
                          {t("inbox_issue.actions.mark_as_duplicate")}
                        </div>
                      </CustomMenu.MenuItem>
                    )}
                    <CustomMenu.MenuItem onClick={() => handleCopyIssueLink(workItemLink)}>
                      <div className="flex items-center gap-2">
                        <CopyIcon width={14} height={14} strokeWidth={2} />
                        {t("inbox_issue.actions.copy")}
                      </div>
                    </CustomMenu.MenuItem>
                    {canDelete && (
                      <CustomMenu.MenuItem onClick={() => setDeleteIssueModal(true)}>
                        <div className="flex items-center gap-2">
                          <TrashIcon width={14} height={14} strokeWidth={2} />
                          {t("inbox_issue.actions.delete")}
                        </div>
                      </CustomMenu.MenuItem>
                    )}
                  </CustomMenu>
                )}
              </>
            )}
          </div>
        </div>
      </Row>

      <div className="lg:hidden">
        <InboxIssueActionsMobileHeader
          inboxIssue={inboxIssue}
          isSubmitting={isSubmitting}
          handleCopyIssueLink={() => handleCopyIssueLink(workItemLink)}
          setAcceptIssueModal={setAcceptIssueModal}
          setDeclineIssueModal={setDeclineIssueModal}
          handleIssueSnoozeAction={handleIssueSnoozeAction}
          setSelectDuplicateIssue={setSelectDuplicateIssue}
          setDeleteIssueModal={setDeleteIssueModal}
          canMarkAsAccepted={canMarkAsAccepted}
          canMarkAsDeclined={canMarkAsDeclined}
          canMarkAsDuplicate={canMarkAsDuplicate}
          canDelete={canDelete}
          isAcceptedOrDeclined={isAcceptedOrDeclined}
          handleInboxIssueNavigation={handleInboxIssueNavigation}
          workspaceSlug={workspaceSlug}
          isMobileSidebar={isMobileSidebar}
          setIsMobileSidebar={setIsMobileSidebar}
          isNotificationEmbed={isNotificationEmbed}
          embedRemoveCurrentNotification={embedRemoveCurrentNotification}
          isProjectAdmin={isProjectAdmin}
          handleActionWithPermission={handleActionWithPermission}
        />
      </div>
    </>
  );
});
