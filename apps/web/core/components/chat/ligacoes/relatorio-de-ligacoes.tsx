/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { useRelatorioDeLigacoes } from "@/components/chat/ligacoes/use-ligacoes";

type Props = { slug: string; apiUrl: string };

const PERIODOS = [7, 30, 90] as const;

type Linha = { id: string | null; name: string; count: number; missed?: number };

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-subtle p-4">
      <span className="text-24 leading-none font-semibold">{valor}</span>
      <span className="text-12 text-secondary">{rotulo}</span>
    </div>
  );
}

function Tabela({ titulo, linhas, comPerdidas = false }: { titulo: string; linhas: Linha[]; comPerdidas?: boolean }) {
  return (
    <div className="overflow-hidden rounded-xl border border-subtle">
      <table className="text-sm w-full">
        <thead className="bg-layer-2 text-12 text-secondary">
          <tr>
            <th className="p-2 text-left font-medium">{titulo}</th>
            <th className="p-2 text-right font-medium">Ligações</th>
            {comPerdidas && <th className="p-2 text-right font-medium">Não atendidas</th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id ?? "sem"} className="border-t border-subtle">
              <td className="p-2">{l.name}</td>
              <td className="p-2 text-right">{l.count}</td>
              {comPerdidas && <td className="p-2 text-right text-secondary">{l.missed ?? 0}</td>}
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr>
              <td colSpan={comPerdidas ? 3 : 2} className="p-4 text-center text-13 text-secondary">
                Sem ligações no período.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Ligações por atendente, entidade e sistema (`chat.gerenciar`). */
export function RelatorioDeLigacoes({ slug, apiUrl }: Props) {
  const [dias, setDias] = useState<number>(30);
  const { data, error } = useRelatorioDeLigacoes(apiUrl, slug, dias);
  if (error) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-15 font-semibold">Ligações</h2>
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setDias(p)}
              className={`rounded-md px-2 py-1 text-12 ${dias === p ? "bg-layer-2 font-medium text-primary" : "text-secondary"}`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Numero rotulo="Recebidas" valor={data.total} />
            <Numero rotulo="Atendidas" valor={data.answered} />
            <Numero rotulo="Não atendidas" valor={data.missed} />
            <Numero rotulo="Concluídas" valor={data.concluded} />
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <Tabela titulo="Atendente" linhas={data.by_attendant} comPerdidas />
            <Tabela titulo="Entidade" linhas={data.by_entity} />
            <Tabela titulo="Sistema" linhas={data.by_system} />
          </div>
        </>
      )}
    </div>
  );
}
