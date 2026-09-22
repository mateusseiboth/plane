/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { RefreshCw } from "lucide-react";
import { BOTAO_SECUNDARIO, CABECALHO, CELULA, TABELA, formatDataHora } from "@/components/chat/disparo/estilos";
import { useFilaZapi } from "@/components/chat/disparo/use-disparo";
import type { ErroDoDisparo } from "@/services/disparo.service";

type Props = { slug: string; apiUrl: string };

/** O que a Z-API ainda não entregou. Fila parada costuma ser o celular da conta desconectado. */
export function AbaFilaZapi({ slug, apiUrl }: Props) {
  const { data: fila, error, isLoading, isFetching, refetch } = useFilaZapi(apiUrl, slug);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          onClick={() => void refetch()}
          disabled={isFetching}
          className={`${BOTAO_SECUNDARIO} flex items-center gap-1`}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
        <span className="text-12 text-tertiary">{fila.length} mensagem(ns) aguardando entrega.</span>
      </div>
      {isLoading && <p className="text-13 text-tertiary">Carregando…</p>}
      {error && (
        <p className="text-13 text-danger-primary">
          {(error as ErroDoDisparo)?.detail || "Não foi possível ler a fila da Z-API."}
        </p>
      )}
      {!isLoading && !error && fila.length === 0 && <p className="text-13 text-tertiary">A fila está vazia.</p>}
      {fila.length > 0 && (
        <table className={TABELA}>
          <thead className={CABECALHO}>
            <tr>
              <th className={CELULA}>Criada em</th>
              <th className={CELULA}>Telefone</th>
              <th className={CELULA}>Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {fila.map((item, i) => (
              <tr key={item.id ?? i} className="border-b border-subtle">
                <td className={CELULA}>{formatDataHora(item.criadaEm)}</td>
                <td className={`${CELULA} font-mono text-12`}>{item.telefone}</td>
                <td className={`${CELULA} line-clamp-2`}>{item.mensagem}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
