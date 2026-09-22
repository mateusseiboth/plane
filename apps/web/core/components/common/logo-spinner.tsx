/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// assets
import AviaoMark from "@/app/assets/logos/aviao-mark.svg?url";

/**
 * Indicador de carregamento embutido (painéis, modais, listas). A tela cheia do
 * carregamento inicial é a `AberturaDoAviao`, no layout raiz.
 */
export function LogoSpinner() {
  return (
    <div className="flex items-center justify-center">
      <img src={AviaoMark} alt="Carregando" className="aviao-loader__bob h-6 w-auto object-contain sm:h-11" />
    </div>
  );
}
