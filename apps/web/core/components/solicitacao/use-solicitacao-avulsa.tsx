/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
// components
import { ModalDeSolicitacaoAvulsa } from "@/components/solicitacao/modal-de-solicitacao-avulsa";

export function useSolicitacaoAvulsa(workspaceSlug: string | undefined) {
  const [aberta, setAberta] = useState(false);

  const modalDaSolicitacao = workspaceSlug && (
    <ModalDeSolicitacaoAvulsa workspaceSlug={workspaceSlug} isOpen={aberta} onClose={() => setAberta(false)} />
  );

  return { openSolicitacao: () => setAberta(true), modalDaSolicitacao };
}
