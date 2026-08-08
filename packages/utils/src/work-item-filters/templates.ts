/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterConditionForBuild, TFilterValue, TStateGroups, TWorkItemFilterProperty } from "@plane/types";
import { COLLECTION_OPERATOR } from "@plane/types";

/**
 * A single condition produced by a template, ready to be fed to
 * `buildWorkItemFilterExpressionFromConditions`.
 */
export type TWorkItemFilterTemplateCondition = TFilterConditionForBuild<TWorkItemFilterProperty, TFilterValue>;

/**
 * State groups as persisted by the API. `triage` only exists in this fork, so it is
 * absent from `TStateGroups` — templates therefore always resolve to state **ids**
 * instead of leaning on the `state_group` filter.
 */
export type TWorkItemStateGroup = TStateGroups | "triage";

/**
 * The only bits of a state a template needs. Kept structural so both regular states
 * (`IState`) and the intake/triage state (`IIntakeState`) can be matched.
 */
export type TWorkItemFilterTemplateState = {
  id: string;
  name: string;
  group: string;
};

export const WORK_ITEM_FILTER_TEMPLATE_KEY = {
  TRIAGE: "triage",
  IT: "it",
  QUALITY: "quality",
  SUPPORT: "support",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

export type TWorkItemFilterTemplateKey =
  (typeof WORK_ITEM_FILTER_TEMPLATE_KEY)[keyof typeof WORK_ITEM_FILTER_TEMPLATE_KEY];

export type TWorkItemFilterTemplate = {
  key: TWorkItemFilterTemplateKey;
  i18n_label: string;
  i18n_description: string;
  /** Canonical state names, matched case/accent-insensitively against the project's states. */
  stateNames?: string[];
  /** State groups, matched against the project's states. */
  stateGroups?: TWorkItemStateGroup[];
  /** Used only when neither the names nor the groups match — e.g. a fully renamed workflow. */
  fallbackStateGroups?: TWorkItemStateGroup[];
};

/**
 * Sector templates. Every state target is matched against the states the project loaded
 * at runtime, so a project with renamed or extra states still resolves correctly.
 */
export const WORK_ITEM_FILTER_TEMPLATES: TWorkItemFilterTemplate[] = [
  {
    key: WORK_ITEM_FILTER_TEMPLATE_KEY.TRIAGE,
    i18n_label: "common.filter_templates.triage.label",
    i18n_description: "common.filter_templates.triage.description",
    stateNames: ["Triagem"],
    stateGroups: ["triage"],
  },
  {
    key: WORK_ITEM_FILTER_TEMPLATE_KEY.IT,
    i18n_label: "common.filter_templates.it.label",
    i18n_description: "common.filter_templates.it.description",
    stateNames: ["A Fazer", "Em Desenvolvimento", "Em Teste"],
    fallbackStateGroups: ["unstarted", "started"],
  },
  {
    key: WORK_ITEM_FILTER_TEMPLATE_KEY.QUALITY,
    i18n_label: "common.filter_templates.quality.label",
    i18n_description: "common.filter_templates.quality.description",
    stateNames: ["Triagem", "Em Análise", "Em Teste"],
    fallbackStateGroups: ["triage", "started"],
  },
  {
    key: WORK_ITEM_FILTER_TEMPLATE_KEY.SUPPORT,
    i18n_label: "common.filter_templates.support.label",
    i18n_description: "common.filter_templates.support.description",
    stateNames: ["Triagem"],
    stateGroups: ["triage", "completed", "cancelled"],
  },
  {
    key: WORK_ITEM_FILTER_TEMPLATE_KEY.IN_PROGRESS,
    i18n_label: "common.filter_templates.in_progress.label",
    i18n_description: "common.filter_templates.in_progress.description",
    stateGroups: ["started"],
  },
  {
    key: WORK_ITEM_FILTER_TEMPLATE_KEY.COMPLETED,
    i18n_label: "common.filter_templates.completed.label",
    i18n_description: "common.filter_templates.completed.description",
    stateGroups: ["completed"],
  },
];

/**
 * Legacy/English state names kept by projects created before the pt-BR rename.
 * Keys are already normalized.
 */
const STATE_NAME_ALIASES: Record<string, string[]> = {
  triagem: ["in take", "intake", "triage"],
  pendencias: ["backlog"],
  "a fazer": ["todo", "to do"],
  "em analise": ["avaliando", "in review"],
  "em desenvolvimento": ["in progress", "em andamento"],
  "em teste": ["in test"],
  concluido: ["done"],
  cancelado: ["cancelled", "canceled"],
};

/** Lowercases and strips accents so "Em Análise" matches "em analise". */
const normalizeStateName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Every name a template state may go by, including its legacy aliases. */
const getAcceptedStateNames = (stateNames: string[] | undefined): Set<string> => {
  const acceptedNames = new Set<string>();
  for (const stateName of stateNames ?? []) {
    const normalizedName = normalizeStateName(stateName);
    acceptedNames.add(normalizedName);
    for (const alias of STATE_NAME_ALIASES[normalizedName] ?? []) acceptedNames.add(normalizeStateName(alias));
  }
  return acceptedNames;
};

const getUniqueStateIds = (states: TWorkItemFilterTemplateState[]): string[] => [
  ...new Set(states.map((state) => state.id)),
];

/**
 * Resolves a template's state targets against the states currently loaded for the entity.
 * @returns The matching state ids, or an empty array when the template targets no state.
 */
export const resolveWorkItemFilterTemplateStateIds = (
  template: TWorkItemFilterTemplate,
  states: TWorkItemFilterTemplateState[]
): string[] => {
  const acceptedNames = getAcceptedStateNames(template.stateNames);
  const acceptedGroups = new Set<string>(template.stateGroups ?? []);
  const matchedStates = states.filter(
    (state) => acceptedNames.has(normalizeStateName(state.name)) || acceptedGroups.has(state.group)
  );
  if (matchedStates.length > 0) return getUniqueStateIds(matchedStates);

  const fallbackGroups = new Set<string>(template.fallbackStateGroups ?? []);
  if (fallbackGroups.size === 0) return [];
  return getUniqueStateIds(states.filter((state) => fallbackGroups.has(state.group)));
};

export type TWorkItemFilterTemplateContext = {
  states: TWorkItemFilterTemplateState[];
};

type TTemplateConditionBuilder = (
  template: TWorkItemFilterTemplate,
  context: TWorkItemFilterTemplateContext
) => TWorkItemFilterTemplateCondition | undefined;

const buildStateCondition: TTemplateConditionBuilder = (template, context) => {
  const stateIds = resolveWorkItemFilterTemplateStateIds(template, context.states);
  if (stateIds.length === 0) return undefined;
  return { property: "state_id", operator: COLLECTION_OPERATOR.IN, value: stateIds };
};

/** Every builder contributes at most one condition; unresolved ones simply drop out. */
const TEMPLATE_CONDITION_BUILDERS: TTemplateConditionBuilder[] = [buildStateCondition];

/**
 * Turns a template into the filter conditions it stands for.
 * @returns An empty array when nothing in the template could be resolved — such a
 * template must not be applied, since it would filter nothing out.
 */
export const buildWorkItemFilterTemplateConditions = (
  template: TWorkItemFilterTemplate,
  context: TWorkItemFilterTemplateContext
): TWorkItemFilterTemplateCondition[] =>
  TEMPLATE_CONDITION_BUILDERS.map((buildCondition) => buildCondition(template, context)).filter(
    (condition): condition is TWorkItemFilterTemplateCondition => condition !== undefined
  );

type TSignatureCondition = {
  property: string;
  operator: string;
  value: unknown;
};

const getConditionSignature = (condition: TSignatureCondition): string => {
  const values = (Array.isArray(condition.value) ? condition.value : [condition.value])
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map(String)
    .toSorted();
  return `${condition.property}:${condition.operator}:${values.join(",")}`;
};

/**
 * Order-insensitive fingerprint of a condition set, used to tell whether the filters
 * currently applied still match a template.
 */
export const getWorkItemFilterConditionsSignature = (conditions: TSignatureCondition[]): string =>
  conditions.map(getConditionSignature).toSorted().join("|");
