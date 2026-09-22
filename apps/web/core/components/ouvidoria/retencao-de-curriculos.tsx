/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { getFieldErrors } from "@/components/mural/helpers";
import { botaoSecundario, campoFiltro } from "@/components/ouvidoria/comum";
// hooks
import { useRetencaoDeCurriculos } from "@/hooks/use-ouvidoria";

/** Prazo de guarda dos currículos (LGPD): passado o prazo, o currículo é apagado. */
export function RetencaoDeCurriculos({ slug }: { slug: string }) {
  const { data, save } = useRetencaoDeCurriculos(slug, true);
  const [dias, setDias] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const valor = dias ?? String(data?.retention_days ?? "");

  const onSave = async () => {
    setErro("");
    try {
      await save(Number(valor));
      setDias(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Prazo de guarda atualizado." });
    } catch (e) {
      setErro(getFieldErrors(e).retention_days ?? "Não foi possível salvar o prazo.");
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2 text-12 text-secondary">
        <label htmlFor="retencao-curriculos">Guardar por</label>
        <input
          id="retencao-curriculos"
          type="number"
          min={30}
          max={3650}
          value={valor}
          onChange={(e) => setDias(e.target.value)}
          className={`${campoFiltro} w-20`}
        />
        <span>dias</span>
        <button type="button" className={botaoSecundario} onClick={() => void onSave()} disabled={dias === null}>
          Salvar
        </button>
      </div>
      {erro && <p className="text-red-500 text-12">{erro}</p>}
    </div>
  );
}
