/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
// ui
import { Button } from "@plane/propel/button";
// assets
import emptyApiTokens from "@/app/assets/empty-state/api-token.svg?url";

type Props = {
  onClick: () => void;
};

export function ApiTokenEmptyState(props: Props) {
  const { onClick } = props;

  return (
    <div
      className={`mx-auto flex w-full items-center justify-center rounded-xs border border-subtle bg-surface-2 px-16 py-10 lg:w-3/4`}
    >
      <div className="flex w-full flex-col items-center text-center">
        <img src={emptyApiTokens} className="w-52 object-contain sm:w-60" alt="empty" />
        <h6 className="mt-6 mb-3 text-18 font-semibold sm:mt-8">No API tokens</h6>
        <p className="mb-7 text-tertiary sm:mb-8">
          Crie tokens de API para compartilhar dados com aplicativos externos de forma segura e fácil, mantendo o controle e a segurança.
        </p>
        <Button className="flex items-center gap-1.5" onClick={onClick}>
          Adicionar token
        </Button>
      </div>
    </div>
  );
}
