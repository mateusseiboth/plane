/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ETabIndices } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
import { Input } from "@plane/ui";
// helpers
import { getTabIndex } from "@plane/utils";
// components
import { TextoFantasmaInput } from "@/components/ia";
// hooks
import { useContextoDeRequisito } from "@/hooks/use-contexto-de-requisito";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useTextoFantasmaCampo } from "@/hooks/use-texto-fantasma-campo";
import { useTipoDeRequisito } from "@/hooks/use-tipo-de-requisito";

type TInboxIssueTitle = {
  data: Partial<TIssue>;
  handleData: (issueKey: keyof Partial<TIssue>, issueValue: Partial<TIssue>[keyof Partial<TIssue>]) => void;
  isTitleLengthMoreThan255Character?: boolean;
  workspaceSlug?: string;
  projectId?: string | null;
};

export const InboxIssueTitle = observer(function InboxIssueTitle(props: TInboxIssueTitle) {
  const { data, handleData, isTitleLengthMoreThan255Character, workspaceSlug, projectId } = props;
  // hooks
  const { isMobile } = usePlatformOS();
  // texto fantasma da IA de requisitos
  const nome = data?.name ?? "";
  const tipo = useTipoDeRequisito(data?.label_ids);
  const { projeto } = useContextoDeRequisito({ workspaceSlug, projectId });
  const { sugestao, descartar, propsDeFoco } = useTextoFantasmaCampo({
    workspaceSlug,
    campo: "titulo",
    texto: nome,
    projectId,
    tipo,
    contexto: { projeto },
  });

  const { getIndex } = getTabIndex(ETabIndices.INTAKE_ISSUE_FORM, isMobile);
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <TextoFantasmaInput
        valor={nome}
        sugestao={sugestao}
        classNameCampo="border-[0.5px] border-transparent px-3 py-2 text-14"
        onAceitar={(texto) => handleData("name", texto)}
        onDescartar={descartar}
      >
        <Input
          id="name"
          name="name"
          type="text"
          value={data?.name}
          onChange={(e) => handleData("name", e.target.value)}
          placeholder={t("title")}
          className="w-full text-14"
          tabIndex={getIndex("name")}
          required
          {...propsDeFoco}
        />
      </TextoFantasmaInput>
      {isTitleLengthMoreThan255Character && (
        <span className="text-11 text-danger-primary">{t("title_should_be_less_than_255_characters")}</span>
      )}
    </div>
  );
});
