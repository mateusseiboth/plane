/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useParams } from "next/navigation";
// components
import { ChatReadOnlyView } from "@/components/chat/chat-readonly-view";
import { PageHead } from "@/components/core/page-title";

export default function ChatViewPage() {
  const { protocol } = useParams();
  return (
    <>
      <PageHead title={`Chat #${protocol}`} />
      <div className="relative h-full w-full overflow-hidden">
        <ChatReadOnlyView protocol={protocol?.toString() ?? ""} />
      </div>
    </>
  );
}
