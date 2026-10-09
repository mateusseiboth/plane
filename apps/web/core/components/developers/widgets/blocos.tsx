/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";

/** Bloco de código com o botão de copiar. */
export function BlocoDeCodigo({ codigo, rotulo }: { codigo: string; rotulo?: string }) {
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(codigo);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copiado", message: "O código está na área de transferência." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não copiado", message: "Selecione o texto e copie com Ctrl+C." });
    }
  };

  return (
    <div className="group relative">
      {rotulo && <p className="mb-1 text-11 font-medium tracking-wide text-tertiary uppercase">{rotulo}</p>}
      <pre className="overflow-x-auto rounded-lg border border-subtle bg-layer-1 p-3 pr-12 text-12 leading-relaxed text-primary">
        <code>{codigo}</code>
      </pre>
      <button
        type="button"
        aria-label="Copiar código"
        onClick={() => void onCopy()}
        className={cn(
          "absolute right-2 flex size-7 items-center justify-center rounded-md text-secondary hover:bg-layer-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none",
          rotulo ? "top-7" : "top-2"
        )}
      >
        <Copy aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}

export function Pilula({ children }: { children: ReactNode }) {
  return (
    <code className="inline-block rounded-sm bg-layer-2 px-1.5 py-0.5 text-12 break-words text-primary">
      {children}
    </code>
  );
}

/** Texto do JSDoc: o que está entre crases vira código. */
export function TextoComCodigo({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/`([^`]+)`/).map((parte, indice) =>
        // Ímpar = o que estava entre crases. A posição é a identidade do pedaço.
        // oxlint-disable-next-line react/no-array-index-key
        indice % 2 === 1 ? <Pilula key={indice}>{parte}</Pilula> : parte
      )}
    </>
  );
}

export function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="flex scroll-mt-6 flex-col gap-4">
      <h2 id={`${id}-titulo`} className="text-20 font-semibold text-primary">
        {titulo}
      </h2>
      <div className="flex flex-col gap-4 text-14 leading-relaxed text-secondary">{children}</div>
    </section>
  );
}

/** Tabela simples: cabeçalhos e linhas já renderizadas. */
export function Tabela({ cabecalhos, linhas }: { cabecalhos: string[]; linhas: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <table className="w-full text-13">
        <thead className="bg-layer-1 text-tertiary">
          <tr>
            {cabecalhos.map((cabecalho) => (
              <th key={cabecalho} className="px-3 py-2 text-left font-medium">
                {cabecalho}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((celulas, indice) => (
            // As linhas vêm de listas estáticas da referência: a posição é a identidade.
            // oxlint-disable-next-line react/no-array-index-key
            <tr key={indice} className="border-t border-subtle align-top">
              {celulas.map((celula, coluna) => (
                // oxlint-disable-next-line react/no-array-index-key
                <td key={coluna} className="px-3 py-2 text-secondary">
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
