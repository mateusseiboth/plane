/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import type { TTamanhoDeWidget } from "@/components/home/grade/grade-rules";

/** O que a grade entrega a todo widget, nativo ou instalado. */
export type TPropsDoWidget = {
  workspaceSlug: string;
  userId: string;
  chave: string;
  tamanho: TTamanhoDeWidget;
};

/**
 * Contrato de um widget da home. Nativo (registrado em `catalogo.ts`) e
 * instalado do marketplace (montado de `widget:<id>`) têm a MESMA forma: a
 * grade move, liga, desliga e redimensiona os dois do mesmo jeito. A altura é
 * livre: cada widget ocupa o que o conteúdo pede.
 */
export type TWidgetDaHome = {
  chave: string;
  titulo: string;
  descricao: string;
  tamanhoPadrao: TTamanhoDeWidget;
  /** `meu`: widget que a própria pessoa enviou, só na home dela. */
  origem: "nativo" | "instalado" | "meu";
  componente: ComponentType<TPropsDoWidget>;
};
