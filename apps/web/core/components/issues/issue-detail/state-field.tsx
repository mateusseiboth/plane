/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import type { TIssueOperations } from "@/components/issues/issue-detail/root";
import { buildStateFieldErrorHandler } from "@/components/issues/issue-detail/state-field.rules";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  value: string | undefined | null;
  issueOperations: TIssueOperations;
  disabled: boolean;
  buttonClassName: string;
};

/**
 * Seletor de etapa da tela do chamado. Quando a API recusa a mudança (por
 * exemplo, falta comentar antes de mover), a mensagem aparece aqui, junto do
 * campo, além do aviso.
 */
export const IssueStateField = observer(function IssueStateField(props: Props) {
  const { workspaceSlug, projectId, issueId, value, issueOperations, disabled, buttonClassName } = props;
  const [mensagem, setMensagem] = useState<string | undefined>(undefined);

  const onChange = (stateId: string) => {
    setMensagem(undefined);
    void issueOperations.update(
      workspaceSlug,
      projectId,
      issueId,
      { state_id: stateId },
      buildStateFieldErrorHandler(setMensagem)
    );
  };

  return (
    <div className="flex w-full grow flex-col">
      <StateDropdown
        value={value}
        onChange={onChange}
        projectId={projectId}
        disabled={disabled}
        buttonVariant="transparent-with-text"
        className="group w-full grow"
        buttonContainerClassName="w-full text-left h-7.5"
        buttonClassName={buttonClassName}
        dropdownArrow
        dropdownArrowClassName="h-3.5 w-3.5 hidden group-hover:inline"
      />
      {mensagem && (
        <p role="alert" className="mt-1 text-12 whitespace-normal text-danger-primary">
          {mensagem}
        </p>
      )}
    </div>
  );
});
