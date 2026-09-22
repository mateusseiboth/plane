/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useParams } from "next/navigation";
// components
import { DisparoApp } from "@/components/chat/disparo/disparo-app";
import { PageHead } from "@/components/core/page-title";

export default function ChatDisparoPage() {
  const { workspaceSlug } = useParams();
  return (
    <>
      <PageHead title="Disparo de mensagens" />
      <div className="relative h-full w-full overflow-hidden">
        <DisparoApp slug={workspaceSlug?.toString() ?? ""} />
      </div>
    </>
  );
}
