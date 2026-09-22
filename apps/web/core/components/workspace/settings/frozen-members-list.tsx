/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Snowflake } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import type { TFrozenMember } from "@plane/types";
// components
import { FreezeDialog } from "@/components/freeze/freeze-dialog";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useFrozenMembers } from "@/hooks/use-freeze";

/**
 * Membros congelados. A lista comum de membros não mostra quem está inativo;
 * é aqui que o administrador vê o motivo e descongela.
 */
export const FrozenMembersList = observer(function FrozenMembersList({ workspaceSlug }: { workspaceSlug: string }) {
  const { members, refetch } = useFrozenMembers(workspaceSlug);
  const [target, setTarget] = useState<TFrozenMember | null>(null);
  const {
    workspace: { fetchWorkspaceMembers },
  } = useMember();

  if (members.length === 0) return null;

  const onUnfrozen = () => {
    void refetch();
    void fetchWorkspaceMembers(workspaceSlug);
  };

  return (
    <div className="pt-4">
      <h4 className="flex items-center gap-2 pt-2 pb-2 text-h5-medium">
        <Snowflake className="size-4" /> Congelados ({members.length})
      </h4>
      <ul className="divide-y divide-subtle rounded-md border border-subtle">
        {members.map((member) => (
          <li key={member.id} className="flex items-center justify-between gap-4 px-3 py-2 text-13">
            <div className="min-w-0">
              <p className="truncate font-medium text-primary">
                {member.display_name} <span className="text-secondary">({member.email})</span>
              </p>
              {member.frozen_reason && <p className="truncate text-secondary">{member.frozen_reason}</p>}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setTarget(member)}>
              Descongelar
            </Button>
          </li>
        ))}
      </ul>
      {target && (
        <FreezeDialog
          open
          onClose={() => setTarget(null)}
          workspaceSlug={workspaceSlug}
          subject="member"
          id={target.id}
          name={target.display_name}
          isFrozen
          onDone={onUnfrozen}
        />
      )}
    </div>
  );
});
