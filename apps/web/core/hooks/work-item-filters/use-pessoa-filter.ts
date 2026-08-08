/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
// plane imports
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import { COLLECTION_OPERATOR, LOGICAL_OPERATOR } from "@plane/types";
import type { TPessoaFilterProperty } from "@plane/utils";
import { isCurrentUserSelected, resolvePessoaFilterAction, toPessoaList } from "@plane/utils";
// store hooks
import { useUser } from "@/hooks/store/user";

export type TPessoaFilter = {
  /** `false` quando não há filtro montado ou o usuário ainda não carregou. */
  isAvailable: boolean;
  isActive: boolean;
  toggle: () => void;
};

/**
 * Liga/desliga o usuário atual numa condição de pessoa **sem apagar o resto do
 * filtro**. Serve aos dois atalhos da barra: "Meus chamados" (`assignee_id`) e
 * "Abertos por mim" (`created_by_id`).
 *
 * A diferença para os modelos do menu é essa: o modelo substitui tudo o que
 * estiver aplicado, enquanto estes botões só acrescentam (ou tiram) você da
 * condição. Dá para combinar o recorte do setor com "só os meus", que é
 * justamente o caso de quem quer parar de olhar o trabalho dos outros.
 *
 * A decisão em si vive em `@plane/utils` (`resolvePessoaFilterAction`), onde é
 * testada; aqui só aplicamos o resultado no store.
 */
export const usePessoaFilter = (
  filter: IWorkItemFilterInstance | undefined,
  property: TPessoaFilterProperty
): TPessoaFilter => {
  const { data: currentUser } = useUser();
  const currentUserId = currentUser?.id;

  const condition = useMemo(
    () => filter?.allConditions.find((c) => c.property === property),
    [filter?.allConditions, property]
  );

  const values = useMemo(() => toPessoaList(condition?.value), [condition?.value]);

  const toggle = useCallback(() => {
    if (!filter) return;
    const acao = resolvePessoaFilterAction(values, currentUserId, !!condition);

    if (acao.type === "add") {
      filter.addCondition(LOGICAL_OPERATOR.AND, { property, operator: COLLECTION_OPERATOR.IN, value: acao.values }, false);
      filter.toggleVisibility(true);
      return;
    }
    if (!condition) return;
    if (acao.type === "remove") filter.removeCondition(condition.id);
    if (acao.type === "update") filter.updateConditionValue(condition.id, acao.values);
  }, [filter, currentUserId, condition, values, property]);

  return {
    isAvailable: !!filter && !!currentUserId,
    isActive: isCurrentUserSelected(values, currentUserId),
    toggle,
  };
};
