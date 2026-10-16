/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { CircleMinus } from "lucide-react";
import { Disclosure } from "@headlessui/react";
// plane imports
import { ROLE, EUserPermissions, MEMBER_TRACKER_ELEMENTS } from "@plane/constants";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EUserProjectRoles, IUser, IWorkspaceMember, TProjectMembership } from "@plane/types";
import { CustomMenu, CustomSelect } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser } from "@/hooks/store/user";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// local imports
import { isProjectMemberRemovable, isProjectRoleEditable } from "./project-role-editable";

export interface RowData extends Pick<TProjectMembership, "original_role"> {
  member: IWorkspaceMember;
}

type NameProps = {
  rowData: RowData;
  workspaceSlug: string;
  /** `member.manage` no sistema: remover outra pessoa. */
  canManageMembers: boolean;
  currentUser: IUser | undefined;
  setRemoveMemberModal: (rowData: RowData) => void;
};

type AccountTypeProps = {
  rowData: RowData;
  workspaceSlug: string;
  projectId: string;
};

export function NameColumn(props: NameProps) {
  const { rowData, workspaceSlug, canManageMembers, currentUser, setRemoveMemberModal } = props;
  // derived values
  const { avatar_url, display_name, email, first_name, id, last_name } = rowData.member;
  const isRemovable = isProjectMemberRemovable({ canManageMembers, isCurrentUser: id === currentUser?.id });

  return (
    <Disclosure>
      {({}) => (
        <div className="group relative">
          <div className="flex w-72 items-center gap-2">
            <div className="flex flex-1 items-center gap-x-2 gap-y-2">
              {avatar_url && avatar_url.trim() !== "" ? (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span className="relative flex size-6 items-center justify-center rounded-full text-on-color capitalize">
                    <img
                      src={getFileURL(avatar_url)}
                      className="absolute top-0 left-0 h-full w-full rounded-full object-cover"
                      alt={display_name || email}
                    />
                  </span>
                </Link>
              ) : (
                <Link href={`/${workspaceSlug}/profile/${id}`}>
                  <span className="relative flex size-6 items-center justify-center rounded-full bg-layer-3 text-11 text-on-color capitalize">
                    {(email ?? display_name ?? "?")[0]}
                  </span>
                </Link>
              )}
              {first_name} {last_name}
            </div>
            {isRemovable && (
              <CustomMenu
                ellipsis
                buttonClassName="p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                optionsClassName="p-1.5"
                placement="bottom-end"
              >
                <CustomMenu.MenuItem>
                  <div
                    className="flex cursor-pointer items-center gap-x-1 font-medium text-danger-primary"
                    data-ph-element={MEMBER_TRACKER_ELEMENTS.PROJECT_MEMBER_TABLE_CONTEXT_MENU}
                    onClick={() => setRemoveMemberModal(rowData)}
                  >
                    <CircleMinus className="size-3.5 flex-shrink-0" />
                    {rowData.member?.id === currentUser?.id ? "Leave " : "Remove "}
                  </div>
                </CustomMenu.MenuItem>
              </CustomMenu>
            )}
          </div>
        </div>
      )}
    </Disclosure>
  );
}

export const AccountTypeColumn = observer(function AccountTypeColumn(props: AccountTypeProps) {
  const { rowData, projectId, workspaceSlug } = props;
  // store hooks
  const {
    project: { updateMemberRole },
    workspace: { getWorkspaceMemberDetails },
  } = useMember();
  const { data: currentUser } = useUser();
  const { canInProject } = useMyWorkspaceActions(workspaceSlug);
  // form info
  const {
    control,
    formState: { errors },
  } = useForm();
  // derived values
  const roleLabel = ROLE[rowData.original_role ?? EUserPermissions.GUEST];
  const isRoleEditable = isProjectRoleEditable({
    canManageMembers: canInProject("member.manage", projectId),
    isCurrentUser: currentUser?.id === rowData.member.id,
    // permissao-estrutural: nível de quem está NA LINHA (dado); admin do espaço tem nível de admin em todo sistema.
    isRowWorkspaceAdmin: Number(getWorkspaceMemberDetails(rowData.member.id)?.role) === EUserPermissions.ADMIN,
  });
  const checkCurrentOptionWorkspaceRole = (value: string) => {
    const currentMemberWorkspaceRole = getWorkspaceMemberDetails(value)?.role as EUserPermissions | undefined;
    if (!value || !currentMemberWorkspaceRole) return ROLE;

    // permissao-estrutural: nível de quem está NA LINHA (dado); convidado do espaço só é convidado no sistema.
    const isGuest = currentMemberWorkspaceRole === EUserPermissions.GUEST;

    return Object.fromEntries(
      // permissao-estrutural: as opções são o nível a gravar (dado), limitadas pelo nível do membro da linha.
      Object.entries(ROLE).filter(([key]) => !isGuest || parseInt(key) === EUserPermissions.GUEST)
    );
  };

  return (
    <>
      {isRoleEditable ? (
        <Controller
          name="role"
          control={control}
          rules={{ required: "O cargo é obrigatório." }}
          render={() => (
            <CustomSelect
              value={rowData.original_role}
              onChange={async (value: EUserProjectRoles) => {
                if (!workspaceSlug) return;
                await updateMemberRole(workspaceSlug.toString(), projectId.toString(), rowData.member.id, value).catch(
                  (err) => {
                    console.log(err, "err");
                    const error = err.error;
                    const errorString = Array.isArray(error) ? error[0] : error;

                    setToast({
                      type: TOAST_TYPE.ERROR,
                      title: "Você ainda não pode alterar este cargo.",
                      message: errorString ?? "Ocorreu um erro ao atualizar a função do membro. Tente novamente.",
                    });
                  }
                );
              }}
              label={
                <div className="flex">
                  <span>{roleLabel}</span>
                </div>
              }
              buttonClassName={`!px-0 !justify-start hover:bg-surface-1 ${errors.role ? "border-danger-strong" : "border-none"}`}
              className="w-32 rounded-md p-0"
              input
            >
              {Object.entries(checkCurrentOptionWorkspaceRole(rowData.member.id)).map(([key, label]) => (
                <CustomSelect.Option key={key} value={key}>
                  {label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          )}
        />
      ) : (
        <div className="flex w-32">
          <span>{roleLabel}</span>
        </div>
      )}
    </>
  );
});
