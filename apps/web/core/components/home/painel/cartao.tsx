/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useId } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@plane/utils";

/**
 * Casca dos cartões do painel. No claro o cartão é branco sobre o fundo cinza
 * da página; no escuro ele sobe um degrau (`layer-1`) para não afundar no fundo.
 */
export const CLASSE_DO_CARTAO = "rounded-2xl border border-subtle bg-surface-1 shadow-raised-100 dark:bg-layer-1";

type TCartaoProps = {
  titulo: string;
  subtitulo?: ReactNode;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Troca de período ou revalidação: o conteúdo fica, esmaecido, até chegar o novo. */
  isAtualizando?: boolean;
};

export function CartaoDoPainel({ titulo, subtitulo, acao, children, className, isAtualizando }: TCartaoProps) {
  const idDoTitulo = useId();
  return (
    <section aria-labelledby={idDoTitulo} className={cn(CLASSE_DO_CARTAO, "flex min-w-0 flex-col p-5", className)}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idDoTitulo} className="text-14 font-semibold text-primary">
            {titulo}
          </h2>
          {subtitulo && <div className="mt-0.5 text-12 text-tertiary">{subtitulo}</div>}
        </div>
        {acao}
      </header>
      <div aria-busy={isAtualizando} className={cn("min-w-0 transition-opacity", isAtualizando && "opacity-60")}>
        {children}
      </div>
    </section>
  );
}

/** Esqueleto de um cartão: as linhas imitam o que vem, sem saltar o layout. */
export function EsqueletoDoCartao({ linhas = 4, altura }: { linhas?: number; altura?: string }) {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-3">
      {altura ? (
        <div className={cn("w-full rounded-lg bg-layer-1 dark:bg-layer-2", altura)} />
      ) : (
        Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="size-4 rounded-full bg-layer-1 dark:bg-layer-2" />
            <div className="h-3 flex-1 rounded bg-layer-1 dark:bg-layer-2" />
            <div className="h-3 w-12 rounded bg-layer-1 dark:bg-layer-2" />
          </div>
        ))
      )}
    </div>
  );
}

/** Vazio de um cartão: ícone num círculo suave e uma frase curta. */
export function VazioDoCartao({
  icone: Icone,
  titulo,
  detalhe,
}: {
  icone: LucideIcon;
  titulo: string;
  detalhe?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-accent-primary">
        <Icone className="size-5" aria-hidden />
      </span>
      <p className="text-13 font-medium text-primary">{titulo}</p>
      {detalhe && <p className="max-w-64 text-12 text-tertiary">{detalhe}</p>}
    </div>
  );
}
