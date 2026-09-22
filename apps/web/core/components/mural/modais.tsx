/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// services
import type { TMuralRecado } from "@/services/mural.service";
// local imports
import { MuralRecadoFormModal } from "./recado-form-modal";
import { MuralRecadoModal } from "./recado-modal";

/**
 * Estado dos modais do mural: recado aberto e formulário (novo ou edição). Home
 * e página usam o mesmo. `inicial` é o recado do link (`?recado=`), aberto até
 * ser fechado uma vez.
 */
export function useMuralModais(inicial?: TMuralRecado) {
  const [selecionado, setSelecionado] = useState<TMuralRecado | undefined>();
  const [isInicialDispensado, setIsInicialDispensado] = useState(false);
  const [editando, setEditando] = useState<TMuralRecado | null>(null);
  const [isFormAberto, setIsFormAberto] = useState(false);
  const setAberto = (recado: TMuralRecado | undefined) => {
    setIsInicialDispensado(true);
    setSelecionado(recado);
  };
  return {
    aberto: selecionado ?? (isInicialDispensado ? undefined : inicial),
    editando,
    isFormAberto,
    onOpen: (recado: TMuralRecado) => setAberto(recado),
    onNew: () => {
      setEditando(null);
      setIsFormAberto(true);
    },
    onEdit: (recado: TMuralRecado) => {
      setAberto(undefined);
      setEditando(recado);
      setIsFormAberto(true);
    },
    onCloseRecado: () => setAberto(undefined),
    onCloseForm: () => setIsFormAberto(false),
  };
}

type Props = { workspaceSlug: string; modais: ReturnType<typeof useMuralModais> };

export function MuralModais({ workspaceSlug, modais }: Props) {
  return (
    <>
      <MuralRecadoModal
        workspaceSlug={workspaceSlug}
        recado={modais.aberto}
        onClose={modais.onCloseRecado}
        onEdit={modais.onEdit}
      />
      <MuralRecadoFormModal
        workspaceSlug={workspaceSlug}
        open={modais.isFormAberto}
        recado={modais.editando}
        onClose={modais.onCloseForm}
      />
    </>
  );
}
