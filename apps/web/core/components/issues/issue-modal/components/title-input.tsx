/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import type { Control, FormState } from "react-hook-form";
import { Controller, useWatch } from "react-hook-form";
// plane imports
import { ETabIndices } from "@plane/constants";
// types
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
// ui
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

type TIssueTitleInputProps = {
  control: Control<TIssue>;
  issueTitleRef: React.MutableRefObject<HTMLInputElement | null>;
  formState: FormState<TIssue>;
  handleFormChange: () => void;
  workspaceSlug?: string;
  projectId?: string | null;
  entityId?: string | null;
};

export const IssueTitleInput = observer(function IssueTitleInput(props: TIssueTitleInputProps) {
  const {
    control,
    issueTitleRef,
    formState: { errors },
    handleFormChange,
    workspaceSlug,
    projectId,
    entityId,
  } = props;
  // store hooks
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();
  // texto fantasma da IA de requisitos
  const nome = useWatch({ control, name: "name" }) ?? "";
  const tipo = useTipoDeRequisito(useWatch({ control, name: "label_ids" }));
  const { projeto, entidade } = useContextoDeRequisito({ workspaceSlug, projectId, entityId });
  const { sugestao, descartar, propsDeFoco } = useTextoFantasmaCampo({
    workspaceSlug,
    campo: "titulo",
    texto: nome,
    projectId,
    entityId,
    tipo,
    contexto: { projeto, entidade },
  });

  const { getIndex } = getTabIndex(ETabIndices.ISSUE_FORM, isMobile);

  const validateWhitespace = (value: string) => {
    if (value.trim() === "") {
      return t("title_is_required");
    }
    return undefined;
  };
  return (
    <div>
      <Controller
        control={control}
        name="name"
        rules={{
          validate: validateWhitespace,
          required: t("title_is_required"),
          maxLength: {
            value: 255,
            message: t("title_should_be_less_than_255_characters"),
          },
        }}
        render={({ field: { value, onChange, ref } }) => (
          <TextoFantasmaInput
            valor={value ?? ""}
            sugestao={sugestao}
            classNameCampo="border-[0.5px] border-transparent px-3 py-2 text-body-sm-regular"
            onAceitar={(texto) => {
              onChange(texto);
              handleFormChange();
            }}
            onDescartar={descartar}
          >
            <Input
              id="name"
              name="name"
              type="text"
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                handleFormChange();
              }}
              ref={issueTitleRef || ref}
              hasError={Boolean(errors.name)}
              placeholder={t("title")}
              className="w-full text-body-sm-regular"
              autoFocus
              tabIndex={getIndex("name")}
              {...propsDeFoco}
            />
          </TextoFantasmaInput>
        )}
      />
      <span className="text-caption-sm-medium text-danger-primary">{errors?.name?.message}</span>
    </div>
  );
});
