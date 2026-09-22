/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Passo "ação" do editor de fluxos do robô: escolhe o destino (ouvidoria,
// currículo, e-mail do responsável), os parâmetros dele e, se quiser, troca a
// pergunta de cada campo. O robô pergunta só o que ainda não sabe.

// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { updatePassoDeAcao, type TPassoDeAcao } from "@/components/ouvidoria/helpers";
// services
import type { ChatDestino } from "@/services/chat.service";

const inputCls = "w-full rounded-md border border-subtle bg-surface-1 text-primary px-2 py-1.5 text-sm outline-none";

type Props = { passo: TPassoDeAcao; destinos: ChatDestino[]; onChange: (passo: TPassoDeAcao) => void };

export function PassoDeAcao({ passo, destinos, onChange }: Props) {
  const destino = destinos.find((d) => d.key === passo.destino);
  return (
    <div className="flex w-full flex-col gap-2">
      <SelectPesquisavel
        value={passo.destino ?? ""}
        onChange={(valor) => onChange(updatePassoDeAcao(passo, { destino: valor }))}
        opcoes={destinos.map((d) => ({ value: d.key, label: d.label }))}
        opcaoVazia={{ value: "", label: "Selecione a ação…" }}
        className="w-72"
      />
      {destino?.params.map((param) => (
        <SelectPesquisavel
          key={param.key}
          value={passo.params?.[param.key] ?? ""}
          onChange={(valor) => onChange(updatePassoDeAcao(passo, { param: [param.key, valor] }))}
          opcoes={param.options}
          opcaoVazia={{ value: "", label: `${param.label}…` }}
          className="w-56"
        />
      ))}
      {destino?.campos.map((campo) => (
        <label key={campo.key} className="text-12 text-secondary">
          {campo.label}
          <input
            className={inputCls}
            placeholder={campo.prompt}
            value={passo.prompts?.[campo.key] ?? ""}
            onChange={(e) => onChange(updatePassoDeAcao(passo, { prompt: [campo.key, e.target.value] }))}
          />
        </label>
      ))}
    </div>
  );
}
