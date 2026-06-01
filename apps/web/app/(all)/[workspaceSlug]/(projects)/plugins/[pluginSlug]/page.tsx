/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { DynamicPlugin } from "@/components/plugins/dynamic-plugin";
// hooks
import { useActivePlugins } from "@/hooks/use-plugins";

const WorkspacePluginPage = observer(function WorkspacePluginPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const pluginSlug = String(params?.pluginSlug ?? "");
  // The page to render can be passed as ?page=<path>; otherwise the first page.
  const page = searchParams?.get("page") ?? undefined;

  const { activePlugins } = useActivePlugins();
  const plugin = activePlugins.find((p) => p.slug === pluginSlug);

  if (!plugin) {
    return (
      <>
        <PageHead title="Plugin" />
        <div className="flex h-full w-full items-center justify-center text-sm text-custom-text-300">
          Loading plugin…
        </div>
      </>
    );
  }

  const target = page ? plugin.contributions?.pages?.find((p) => p.path === page) : plugin.contributions?.pages?.[0];

  return (
    <>
      <PageHead title={target?.title ?? plugin.name} />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto p-4">
        <DynamicPlugin pluginId={plugin.id} page={page} />
      </div>
    </>
  );
});

export default WorkspacePluginPage;
