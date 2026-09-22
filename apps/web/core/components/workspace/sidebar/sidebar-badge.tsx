/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ComponentType } from "react";
import { observer } from "mobx-react";
// hooks
import { useOuvidoriaNaoLidas, useOuvidoriaPermissoes } from "@/hooks/use-ouvidoria";

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

/** Contador ao lado do item do menu, por chave do item (strategy map). */
const BADGES: Record<string, ComponentType<TBadgeProps>> = {
  ouvidoria: OuvidoriaNaoLidas,
};

export function SidebarBadge({ itemKey, slug }: { itemKey: string; slug: string }) {
  const Badge = BADGES[itemKey];
  return Badge ? <Badge slug={slug} /> : null;
}
