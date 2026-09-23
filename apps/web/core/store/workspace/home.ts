/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable } from "mobx";
// store
import type { IWorkspaceLinkStore } from "./link.store";
import { WorkspaceLinkStore } from "./link.store";

/**
 * Estado da home que atravessa componentes: o "Gerenciar widgets" abre pelo
 * cabeçalho da página e pela grade vazia. A grade em si (ordem, tamanho,
 * ligado) vive em `useGradeDaHome`, salva por pessoa e por espaço na API.
 */
export interface IHomeStore {
  // observables
  showWidgetSettings: boolean;
  //stores
  quickLinks: IWorkspaceLinkStore;
  // actions
  toggleWidgetSettings: (value?: boolean) => void;
}

export class HomeStore implements IHomeStore {
  // observables
  showWidgetSettings = false;
  // stores
  quickLinks: IWorkspaceLinkStore;

  constructor() {
    makeObservable(this, {
      showWidgetSettings: observable,
      toggleWidgetSettings: action,
    });
    this.quickLinks = new WorkspaceLinkStore();
  }

  toggleWidgetSettings = (value?: boolean) => {
    this.showWidgetSettings = value ?? !this.showWidgetSettings;
  };
}
