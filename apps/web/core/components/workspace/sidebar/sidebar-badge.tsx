/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { observer } from "mobx-react";
// hooks
import { useOuvidoriaNaoLidas, useOuvidoriaPermissoes } from "@/hooks/use-ouvidoria";
import { useResumoDaTriagem } from "@/hooks/use-resumo-da-triagem";

type TBadgeProps = { slug: string };

function Contador({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto rounded-full bg-accent-primary px-1.5 text-11 leading-4 font-medium text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const OuvidoriaNaoLidas = observer(function OuvidoriaNaoLidas({ slug }: TBadgeProps) {
  const { canReadOuvidoria } = useOuvidoriaPermissoes(slug);
  const { count } = useOuvidoriaNaoLidas(slug, canReadOuvidoria);
  return <Contador count={count} />;
});

// Só aparece onde o item aparece: a barra já escondeu o item de quem não abre nem tria pedidos.
const TriagemResolvidas = observer(function TriagemResolvidas({ slug }: TBadgeProps) {
  const { resolvidasNaoVistas } = useResumoDaTriagem(slug);
  return <Contador count={resolvidasNaoVistas} />;
});

/** Contador ao lado do item do menu, por chave do item (strategy map). */
const BADGES: Record<string, ComponentType<TBadgeProps>> = {
  ouvidoria: OuvidoriaNaoLidas,
  "global-intake": TriagemResolvidas,
};

export function SidebarBadge({ itemKey, slug }: { itemKey: string; slug: string }) {
  const Badge = BADGES[itemKey];
  return Badge ? <Badge slug={slug} /> : null;
}
