/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectRolePermissions } from "@/hooks/use-project-role-permissions";
// local imports
import type { TWorkItemStateDropdownBaseProps } from "./base";
import { WorkItemStateDropdownBase } from "./base";

type TWorkItemStateDropdownProps = Omit<
  TWorkItemStateDropdownBaseProps,
  "stateIds" | "getStateById" | "onDropdownOpen" | "isInitializing"
> & {
  stateIds?: string[];
};

export const StateDropdown = observer(function StateDropdown(props: TWorkItemStateDropdownProps) {
  const { projectId, stateIds: propsStateIds, value: currentStateId } = props;
  // router params
  const { workspaceSlug } = useParams();
  // states
  const [stateLoader, setStateLoader] = useState(false);
  // store hooks
  const { fetchProjectStates, getProjectStateIds, getStateById } = useProjectState();
  const { canMoveToState, role } = useProjectRolePermissions(projectId ?? undefined);
  // derived values
  const allStateIds = propsStateIds ?? getProjectStateIds(projectId) ?? [];

  const currentState = currentStateId ? getStateById(currentStateId) : undefined;
  const fromGroup = currentState?.group ?? "backlog";

  // Filter available states based on role-based transition rules
  const stateIds = useMemo(() => {
    if (!role) return allStateIds;
    return allStateIds.filter((id) => {
      if (id === currentStateId) return true; // always allow current state
      const targetState = getStateById(id);
      if (!targetState) return false;
      return canMoveToState(fromGroup, targetState.group, currentState?.name, targetState.name);
    });
  }, [allStateIds, currentStateId, fromGroup, currentState?.name, canMoveToState, getStateById, role]);

  // fetch states if not provided
  const onDropdownOpen = async () => {
    if ((allStateIds === undefined || allStateIds.length === 0) && workspaceSlug && projectId) {
      setStateLoader(true);
      await fetchProjectStates(workspaceSlug.toString(), projectId);
      setStateLoader(false);
    }
  };

  return (
    <WorkItemStateDropdownBase
      {...props}
      getStateById={getStateById}
      isInitializing={stateLoader}
      stateIds={stateIds}
      onDropdownOpen={onDropdownOpen}
    />
  );
});
