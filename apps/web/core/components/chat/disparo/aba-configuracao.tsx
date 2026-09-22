/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { groupErrosPorCampo } from "@/components/chat/ligacoes/ligacao-helpers";
import { BOTAO, CAIXA, ERRO_DO_CAMPO, ROTULO, toastErro, toastSucesso } from "@/components/chat/disparo/estilos";
import { useConfigDoDisparo } from "@/components/chat/disparo/use-disparo";
import type { ErroDoDisparo } from "@/services/disparo.service";

type Props = { slug: string; apiUrl: string };

export function AbaConfiguracao({ slug, apiUrl }: Props) {
  const { data, refetch, api } = useConfigDoDisparo(apiUrl, slug);
  const [valor, setValor] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const atual = valor ?? String(data?.mensagens_por_minuto ?? "");

  const onSave = async () => {
    setErros({});
    try {
      await api.saveConfig(slug, { mensagens_por_minuto: Number(atual) });
      toastSucesso("Ritmo salvo.");
      setValor(null);
      void refetch();
    } catch (e) {
      setErros(groupErrosPorCampo(e as ErroDoDisparo));
      toastErro(e, "Não foi possível salvar.");
    }
  };

  return (
    <div className="max-w-sm space-y-3">
      <div>
        <label htmlFor="disparo-ritmo" className={ROTULO}>
          Mensagens por minuto (1 a 60)
        </label>
        <input
          id="disparo-ritmo"
          type="number"
          min={1}
          max={60}
          value={atual}
          onChange={(e) => setValor(e.target.value)}
          className={CAIXA}
        />
        {erros.mensagens_por_minuto && <p className={ERRO_DO_CAMPO}>{erros.mensagens_por_minuto}</p>}
        <p className="mt-1 text-11 text-tertiary">Ritmo alto aumenta o risco de o WhatsApp bloquear o número.</p>
      </div>
      <button onClick={() => void onSave()} className={BOTAO}>
        Salvar
      </button>
    </div>
  );
}
