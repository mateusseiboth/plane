/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TEntity, TFilterProperty } from "@plane/types";
import { EQUALITY_OPERATOR, COLLECTION_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

/**
 * Entity filter specific params
 */
export type TCreateEntityFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<undefined> & {
    entities: TEntity[];
  };

/**
 * Helper to get the entity multi select config
 * @param params - The filter params
 * @returns The entity multi select config
 */
export const getEntityMultiSelectConfig = (params: TCreateEntityFilterParams) =>
  getMultiSelectConfig<TEntity, string, undefined>(
    {
      items: params.entities,
      getId: (entity) => entity.id,
      getLabel: (entity) => entity.name,
      getValue: (entity) => entity.id,
      getIconData: () => undefined,
    },
    {
      singleValueOperator: EQUALITY_OPERATOR.EXACT,
      ...params,
    },
    {
      ...params,
    }
  );

/**
 * Get the entity filter config
 * @template P - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the entity filter config
 */
export const getEntityFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateEntityFilterParams> =>
  (params: TCreateEntityFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Entity",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getEntityMultiSelectConfig(updatedParams)
        ),
      ]),
    });
