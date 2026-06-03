/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { AttendantChatApp } from "@/components/chat/attendant-app";
import { PageHead } from "@/components/core/page-title";

export default function WorkspaceChatPage() {
  return (
    <>
      <PageHead title="Atendimento" />
      <div className="relative h-full w-full overflow-hidden">
        <AttendantChatApp />
      </div>
    </>
  );
}
