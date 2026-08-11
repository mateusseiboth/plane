/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { IWorkItemFilterInstance } from "@plane/shared-state";
import { buildWorkItemFilterExpressionFromConditions } from "@plane/shared-state";
import type {
  TWorkItemFilterTemplateCondition,
  TWorkItemFilterTemplateKey,
  TWorkItemFilterTemplateState,
} from "@plane/utils";
import {
  buildWorkItemFilterTemplateConditions,
  getWorkItemFilterConditionsSignature,
  WORK_ITEM_FILTER_TEMPLATES,
} from "@plane/utils";
// store hooks
import { useProjectState } from "@/hooks/store/use-project-state";

export type TWorkItemFilterTemplateOption = {
  key: TWorkItemFilterTemplateKey;
  label: string;
  description: string;
  isActive: boolean;
  applyTemplate: () => void;
};

export type TWorkItemFilterTemplates = {
  templates: TWorkItemFilterTemplateOption[];
  activeTemplate: TWorkItemFilterTemplateOption | undefined;
  canClearFilters: boolean;
  clearFilters: () => void;
};

/**
 * Cross-project screens list the same state name once per project. Keeping the first id
 * of each name mirrors what the state filter itself offers, and the API expands the
 * selected id back to every same-named state of the workspace.
 */
const dedupeStatesByName = (states: TWorkItemFilterTemplateState[]): TWorkItemFilterTemplateState[] => {
  const stateByName = new Map<string, TWorkItemFilterTemplateState>();
  for (const state of states) {
    if (!stateByName.has(state.name)) stateByName.set(state.name, state);
  }
  return [...stateByName.values()];
};

/**
 * Exposes the sector filter templates for a work item filter instance.
 * Templates are matched against the states loaded for the current entity — the project's
 * states on project screens, the workspace's states on the global screen — so nothing
 * relies on hardcoded ids.
 */
export const useWorkItemFilterTemplates = (filter: IWorkItemFilterInstance | undefined): TWorkItemFilterTemplates => {
  // router
  const { projectId: routerProjectId } = useParams();
  // store hooks
  const { t } = useTranslation();
  const { projectStates, workspaceStates, getProjectIntakeState } = useProjectState();
  // derived values
  // The project states endpoint leaves the triage state out, so the intake state is
  // appended explicitly; the workspace endpoint already includes it.
  const intakeState = getProjectIntakeState(routerProjectId?.toString());
  const states = useMemo(
    () => dedupeStatesByName([...(projectStates ?? workspaceStates ?? []), ...(intakeState ? [intakeState] : [])]),
    [projectStates, workspaceStates, intakeState]
  );
  const currentSignature = getWorkItemFilterConditionsSignature(filter?.allConditions ?? []);

  /**
   * Onde fica o modelo escolhido, POR PROJETO.
   *
   * Guardamos a CHAVE do modelo, não as condições: os ids de etapa mudam de
   * projeto para projeto, e gravá-los deixaria o filtro apontando para estados
   * que não existem ali. Com a chave, a resolução acontece de novo a cada
   * carga, contra as etapas reais daquele projeto.
   */
  const chaveDoArmazenamento = `aviao:modelo-de-filtro:${routerProjectId?.toString() ?? "espaco-de-trabalho"}`;

  const lembrarModelo = useCallback(
    (key: string | null) => {
      try {
        if (key) localStorage.setItem(chaveDoArmazenamento, key);
        else localStorage.removeItem(chaveDoArmazenamento);
      } catch {
        // navegador sem armazenamento (aba anônima restrita): só não lembra
      }
    },
    [chaveDoArmazenamento]
  );

  const applyTemplate = useCallback(
    (conditions: TWorkItemFilterTemplateCondition[], key?: string) => {
      if (!filter) return;
      const expression = buildWorkItemFilterExpressionFromConditions({ conditions });
      if (!expression) return;
      // Replaces every applied filter — the user is free to tweak it afterwards.
      filter.resetExpression(expression, false);
      filter.toggleVisibility(true);
      if (key) lembrarModelo(key);
    },
    [filter, lembrarModelo]
  );

  const templates = useMemo(
    () =>
      WORK_ITEM_FILTER_TEMPLATES.map((template) => ({
        template,
        conditions: buildWorkItemFilterTemplateConditions(template, { states }),
      }))
        // A template whose states/assignee could not be resolved would filter nothing out.
        .filter(({ conditions }) => conditions.length > 0)
        .map(({ template, conditions }) => ({
          key: template.key,
          label: t(template.i18n_label),
          description: t(template.i18n_description),
          isActive: getWorkItemFilterConditionsSignature(conditions) === currentSignature,
          applyTemplate: () => applyTemplate(conditions, template.key),
        })),
    [states, currentSignature, applyTemplate, t]
  );

  const clearFilters = useCallback(() => {
    filter?.clearFilters();
    lembrarModelo(null);
  }, [filter, lembrarModelo]);

  /**
   * Reaplica o modelo lembrado na primeira carga.
   *
   * Só quando não há filtro montado: se a pessoa chegou com algo aplicado (link
   * compartilhado, visualização salva), sobrescrever seria tirar da mão dela o
   * que ela pediu. E espera os `templates`, que só existem depois de as etapas
   * do projeto carregarem.
   */
  const jaRestaurou = useRef(false);
  useEffect(() => {
    if (jaRestaurou.current || !filter || templates.length === 0) return;
    jaRestaurou.current = true;
    if ((filter.allConditions ?? []).length > 0) return;
    let lembrado: string | null = null;
    try {
      lembrado = localStorage.getItem(chaveDoArmazenamento);
    } catch {
      return;
    }
    templates.find((template) => template.key === lembrado)?.applyTemplate();
  }, [templates, filter, chaveDoArmazenamento]);

  return {
    templates,
    activeTemplate: templates.find((template) => template.isActive),
    canClearFilters: filter?.canClearFilters ?? false,
    clearFilters,
  };
};
