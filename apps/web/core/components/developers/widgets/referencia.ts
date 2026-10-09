/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import referenciaJson from "@mateusseiboth/widgets-aviao/referencia.json";
import type { TReferencia } from "@mateusseiboth/widgets-aviao/referencia-tipos";

/**
 * A referência do SDK de widgets, gerada do código do pacote
 * (`packages/widget-sdk/scripts/gerar-referencia.ts`). A página não escreve
 * documentação à mão: tudo o que mostra de API sai daqui.
 */
export const referencia: TReferencia = referenciaJson as TReferencia;
