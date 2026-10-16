/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {observer} from "mobx-react";
import {useParams} from "next/navigation";
import {useState} from "react";
// ui
import {EIssuesStoreType} from "@plane/types";
import {ContextMenu, CustomMenu} from "@plane/ui";
import {cn} from "@plane/utils";
// hooks
import {useIssues} from "@/hooks/store/use-issues";
import {useUser} from "@/hooks/store/user";
import {useMyWorkspaceActions} from "@/hooks/use-workflow-role";
import {isIssueDeleteAllowed, isIssueEditAllowed} from "@/lib/permissoes/regras-de-chamado";
// local imports
import {DeleteIssueModal} from "../../delete-issue-modal";
import type {IQuickActionProps} from "../list/list-view-types";
import type {MenuItemFactoryProps} from "./helper";
import {useArchivedIssueMenuItems} from "./helper";

export const ArchivedIssueQuickActions = observer(function ArchivedIssueQuickActions(props: IQuickActionProps) {
  const {
    issue,
    handleDelete,
    handleRestore,
    customActionButton,
    portalElement,
    readOnly = false,
    placements = "bottom-end",
    parentRef,
  } = props;
  // states
  const [deleteIssueModal, setDeleteIssueModal] = useState(false);
  // router
  const {workspaceSlug} = useParams();
  // store hooks
  const {data: currentUser} = useUser();
  const {canInProject} = useMyWorkspaceActions(workspaceSlug?.toString());

  const {issuesFilter} = useIssues(EIssuesStoreType.ARCHIVED);
  // derived values
  const activeLayout = `${issuesFilter.issueFilters?.displayFilters?.layout} layout`;
  // auth: restaurar confere issue.edit.* (a rota de arquivo); excluir, issue.delete.* (dono ou todos).
  const canInIssueProject = (action: string) => canInProject(action, issue.project_id ?? undefined);
  const isEditingAllowed = isIssueEditAllowed(canInIssueProject) && !readOnly;
  const isRestoringAllowed = handleRestore && isIssueEditAllowed(canInIssueProject);
  const isDeletingAllowed =
    isIssueDeleteAllowed(canInIssueProject, issue.created_by === currentUser?.id) && !readOnly;

  // Menu items and modals using helper
  const menuItemProps: MenuItemFactoryProps = {
    issue,
    workspaceSlug: workspaceSlug?.toString(),
    activeLayout,
    isEditingAllowed,
    isDeletingAllowed,
    isRestoringAllowed: !!isRestoringAllowed,
    setIssueToEdit: () => {},
    setCreateUpdateIssueModal: () => {},
    setDeleteIssueModal,
    handleRestore,
    handleDelete,
  };

  const MENU_ITEMS = useArchivedIssueMenuItems(menuItemProps);

  const CONTEXT_MENU_ITEMS = MENU_ITEMS.map(function CONTEXT_MENU_ITEMS(item) {
    return {
      ...item,

      onClick: () => {
        item.action();
      },
    };
  });
  return (
    <>
      {/* Modals */}
      <DeleteIssueModal
        data={issue}
        isOpen={deleteIssueModal}
        handleClose={() => setDeleteIssueModal(false)}
        onSubmit={handleDelete}
      />

      <ContextMenu
        parentRef={parentRef}
        items={CONTEXT_MENU_ITEMS}
      />
      <CustomMenu
        ellipsis
        customButton={customActionButton}
        portalElement={portalElement}
        placement={placements}
        menuItemsClassName="z-[14]"
        maxHeight="lg"
        useCaptureForOutsideClick
        closeOnSelect
      >
        {MENU_ITEMS.map((item) => {
          if (item.shouldRender === false) return null;
          return (
            <CustomMenu.MenuItem
              key={item.key}
              onClick={() => {
                item.action();
              }}
              className={cn(
                "flex items-center gap-2",
                {
                  "text-placeholder": item.disabled,
                },
                item.className,
              )}
              disabled={item.disabled}
            >
              {item.icon && <item.icon className={cn("h-3 w-3", item.iconClassName)} />}
              <div>
                <h5>{item.title}</h5>
                {item.description && (
                  <p
                    className={cn("whitespace-pre-line text-tertiary", {
                      "text-placeholder": item.disabled,
                    })}
                  >
                    {item.description}
                  </p>
                )}
              </div>
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </>
  );
});
