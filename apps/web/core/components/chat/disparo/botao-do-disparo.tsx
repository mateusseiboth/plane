/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import Link from "next/link";
import { Megaphone } from "lucide-react";
import { ACAO_DO_DISPARO } from "@/components/chat/disparo/disparo-helpers";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";

/** Atalho do cabeçalho do atendimento. Só aparece para quem tem `chat.disparo`. */
export function BotaoDoDisparo({ slug }: { slug: string }) {
  const { can } = useMyWorkspaceActions(slug);
  if (!can(ACAO_DO_DISPARO)) return null;
  return (
    <Link
      href={`/${slug}/chat/disparo`}
      className="rounded-md p-1.5 text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
      title="Disparo de mensagens"
    >
      <Megaphone className="h-4 w-4" />
    </Link>
  );
}
