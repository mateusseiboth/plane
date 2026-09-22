/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { readErroDoCampo } from "@/components/chat/atendente/atendente-helpers";
import { useFeriados } from "@/components/chat/atendente/use-atendente";
import type { ErroDoChat, Feriado } from "@/services/atendente.service";

const CAIXA = "rounded-md border bg-surface-1 px-2 py-1.5 text-sm text-primary outline-none";
const borda = (erro?: string) => (erro ? "border-danger-primary" : "border-subtle");

/**
 * Calendário de feriados, dentro da aba Horários: no feriado o atendimento está
 * fora do horário o dia inteiro. "Todo ano" repete no mesmo dia e mês.
 */
export function CalendarioDeFeriados({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const { feriados, api, refetch } = useFeriados(apiUrl, slug);
  if (!feriados) return <div className="text-sm text-secondary">Carregando feriados…</div>;
  return (
    <ListaDeFeriados
      key={JSON.stringify(feriados)}
      inicial={feriados}
      onSalvar={async (lista) => refetch(await api.saveFeriados(slug, lista), { revalidate: false })}
    />
  );
}

/** Linha em edição: `uid` só para a chave do React, não vai ao servidor. */
type Linha = Feriado & { uid: string };

const toLinha = (f: Feriado): Linha => ({ ...f, uid: crypto.randomUUID() });
const toFeriado = ({ uid: _uid, ...f }: Linha): Feriado => f;

function ListaDeFeriados({
  inicial,
  onSalvar,
}: {
  inicial: Feriado[];
  onSalvar: (lista: Feriado[]) => Promise<unknown>;
}) {
  const [lista, setLista] = useState<Linha[]>(() => inicial.map(toLinha));
  const [erro, setErro] = useState<ErroDoChat | null>(null);

  const change = (i: number, patch: Partial<Linha>) =>
    setLista((atual) => atual.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const save = async () => {
    try {
      await onSalvar(lista.map(toFeriado));
      setErro(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Feriados atualizados." });
    } catch (e) {
      setErro(e as ErroDoChat);
      setToast({ type: TOAST_TYPE.ERROR, title: "Não salvo", message: (e as ErroDoChat)?.detail ?? "Tente de novo." });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-13 font-medium">Feriados</span>
        <button
          type="button"
          className="rounded-md border border-subtle px-3 py-1.5 text-13"
          onClick={() => setLista([...lista, toLinha({ date: "", label: "", recorrente: false })])}
        >
          + Feriado
        </button>
      </div>
      <p className="text-12 text-secondary">No feriado, o atendimento fica fora do horário o dia inteiro.</p>
      {lista.map((f, i) => {
        const erroDaData = readErroDoCampo(erro, `feriados[${i}].date`);
        const erroDaDescricao = readErroDoCampo(erro, `feriados[${i}].label`);
        return (
          <div key={f.uid} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={f.date}
                onChange={(e) => change(i, { date: e.target.value })}
                className={`${CAIXA} ${borda(erroDaData)}`}
              />
              <input
                value={f.label}
                onChange={(e) => change(i, { label: e.target.value })}
                placeholder="Descrição"
                className={`${CAIXA} flex-1 ${borda(erroDaDescricao)}`}
              />
              <label className="flex items-center gap-1 text-12 whitespace-nowrap text-secondary">
                <input
                  type="checkbox"
                  checked={f.recorrente}
                  onChange={(e) => change(i, { recorrente: e.target.checked })}
                />
                Todo ano
              </label>
              <button
                type="button"
                title="Remover"
                className="rounded p-1.5 text-secondary hover:bg-danger-subtle hover:text-danger-primary"
                onClick={() => setLista(lista.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {(erroDaData || erroDaDescricao) && (
              <span className="text-11 text-danger-primary">
                {[erroDaData, erroDaDescricao].filter(Boolean).join(" ")}
              </span>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="bg-primary self-start rounded-md px-3 py-1.5 text-13 text-on-color"
        onClick={() => void save()}
      >
        Salvar feriados
      </button>
    </div>
  );
}
