/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { computed, makeObservable, observable } from "mobx";
import type { TPage, TPageExtended } from "@plane/types";
import type { RootStore } from "@/plane-web/store/root.store";
import type { TBasePageServices } from "@/store/pages/base-page";

export type TExtendedPageInstance = TPageExtended & {
  asJSONExtended: TPageExtended;
};

/**
 * Hierarquia da página (usada pela árvore da wiki): a mãe, a posição entre as
 * irmãs e quantas filhas ela tem. Fica observável para a árvore redesenhar ao
 * mover ou reordenar sem recarregar a lista.
 */
export class ExtendedBasePage implements TExtendedPageInstance {
  parent_id: string | null | undefined;
  sort_order: number | undefined;
  sub_pages_count: number | undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(store: RootStore, page: TPage, services: TBasePageServices) {
    this.parent_id = page?.parent_id ?? null;
    this.sort_order = page?.sort_order;
    this.sub_pages_count = page?.sub_pages_count;
    makeObservable(this, {
      parent_id: observable.ref,
      sort_order: observable.ref,
      sub_pages_count: observable.ref,
      asJSONExtended: computed,
    });
  }

  get asJSONExtended(): TExtendedPageInstance["asJSONExtended"] {
    return {
      parent_id: this.parent_id,
      sort_order: this.sort_order,
      sub_pages_count: this.sub_pages_count,
    };
  }
}
