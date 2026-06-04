/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import * as LucideIcons from "lucide-react";
import { Puzzle } from "lucide-react";
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
// hooks
import { useActivePlugins } from "@/hooks/use-plugins";
// store
import { pluginStore } from "@/store/plugin.store";

function resolveIcon(name?: string): React.ComponentType<{ className?: string }> {
  if (!name) return Puzzle;
  const icon = (LucideIcons as Record<string, unknown>)[name];
  return (typeof icon === "function" ? icon : Puzzle) as React.ComponentType<{ className?: string }>;
}

/**
 * Renders sidebar items contributed by active plugins.
 * Each item links to /:workspaceSlug/plugins/:slug?page=:page.
 */
export const PluginSidebarItems = observer(function PluginSidebarItems() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { activePlugins } = useActivePlugins();

  // Runtime items registered via navigation.addSidebarItem (G5). Observed so the
  // sidebar updates live when a plugin registers/removes an item.
  const runtimeSidebar = pluginStore.runtimeSidebar;

  const items = useMemo(() => {
    const slugById = new Map(activePlugins.map((p) => [p.id, p.slug]));
    const collected = activePlugins.flatMap((plugin) =>
      (plugin.contributions?.sidebar ?? []).map((item) => ({
        key: `${plugin.id}:${item.id}`,
        label: item.label,
        icon: item.icon,
        order: item.order ?? 0,
        href: `/${workspaceSlug}/plugins/${plugin.slug}?page=${encodeURIComponent(item.page)}`,
        match: `/${workspaceSlug}/plugins/${plugin.slug}`,
      }))
    );
    for (const it of Object.values(runtimeSidebar)) {
      const slug = it.pluginSlug ?? slugById.get(it.pluginId);
      if (!slug) continue;
      const key = `${it.pluginId}:${it.id}`;
      if (collected.some((c) => c.key === key)) continue; // manifest item wins
      collected.push({
        key,
        label: it.label,
        icon: it.icon,
        order: it.order ?? 0,
        href: `/${workspaceSlug}/plugins/${slug}?page=${encodeURIComponent(it.page)}`,
        match: `/${workspaceSlug}/plugins/${slug}`,
      });
    }
    return collected.sort((a, b) => a.order - b.order);
  }, [activePlugins, workspaceSlug, runtimeSidebar]);

  if (!workspaceSlug || items.length === 0) return null;

  return (
    <>
      {items.map((item) => {
        const Icon = resolveIcon(item.icon);
        const isActive = pathname?.startsWith(item.match) ?? false;
        return (
          <Link key={item.key} href={item.href}>
            <SidebarNavItem isActive={isActive}>
              <div className="flex w-full items-center gap-1.5 truncate">
                <Icon className="size-4 flex-shrink-0" />
                <span className="truncate text-13 font-medium">{item.label}</span>
              </div>
            </SidebarNavItem>
          </Link>
        );
      })}
    </>
  );
});
