/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@plane/utils";

/** Cor do ponto de prioridade. Uma definição só para toda a home. */
export const PRIORIDADE_COR: Record<string, string> = {
  urgent: "text-danger-primary",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-500",
  none: "text-tertiary",
};

const TOM = {
  neutro: { borda: "border-subtle", icone: "text-secondary" },
  danger: { borda: "border-danger-subtle-1", icone: "text-danger-primary" },
  accent: { borda: "border-accent-subtle-1", icone: "text-accent-primary" },
} as const;

type Props = {
  icone: React.FC<{ className?: string }>;
  titulo: string;
  /** Aparece como selo ao lado do título. */
  contagem?: number;
  tom?: keyof typeof TOM;
  acao?: { rotulo: string; href: string };
  /** Mostrado no lugar do conteúdo quando não há nada a listar. */
  vazio?: string;
  children?: ReactNode;
};

/**
 * Moldura única dos blocos da home.
 *
 * Antes cada widget desenhava a própria borda, título e link de "ver todos" com
 * medidas ligeiramente diferentes, e a tela ficava desalinhada. Um componente
 * só mantém tudo no mesmo ritmo.
 */
export function HomeCard({ icone: Icone, titulo, contagem, tom = "neutro", acao, vazio, children }: Props) {
  const cores = TOM[tom];
  const semConteudo = !children;

  return (
    <section className={cn("flex flex-col rounded-xl border bg-surface-1", cores.borda)}>
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icone className={cn("size-4 shrink-0", cores.icone)} />
          <h3 className="truncate text-13 font-semibold text-primary">{titulo}</h3>
          {contagem !== undefined && contagem > 0 && (
            <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-11 tabular-nums text-secondary">
              {contagem}
            </span>
          )}
        </div>
        {acao && (
          <Link
            href={acao.href}
            className="flex shrink-0 items-center gap-1 text-11 text-accent-primary hover:underline"
          >
            {acao.rotulo}
            <ArrowRight className="size-3" />
          </Link>
        )}
      </header>
      <div className="px-4 pb-3">
        {semConteudo ? <p className="py-6 text-center text-12 text-tertiary">{vazio}</p> : children}
      </div>
    </section>
  );
}
