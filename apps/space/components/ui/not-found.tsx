/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// images
import Image404 from "@/app/assets/404.svg?url";

export function PageNotFound() {
  return (
    <div className={`h-screen w-full overflow-hidden bg-surface-1`}>
      <div className="grid h-full place-items-center p-4">
        <div className="space-y-8 text-center">
          <div className="relative mx-auto h-60 w-60 lg:h-80 lg:w-80">
            <img src={Image404} alt="404 - Página não encontrada" className="h-full w-full object-contain" />
          </div>
          <div className="space-y-2">
            <h3 className="text-16 font-semibold">Ops! Algo deu errado.</h3>
            <p className="text-13 text-secondary">
              Desculpe, a página que você procura não foi encontrada. Ela pode ter sido removida, ter tido o nome
              alterado ou estar temporariamente indisponível.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
