/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { findCorDoAvatar } from "@/components/chat/atendente/cores-do-atendimento";

const TAMANHO_DO_AVATAR = {
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10",
  lg: "h-12 w-12 text-lg",
} as const;

type Props = { name?: string | null; phone?: string | null; size?: keyof typeof TAMANHO_DO_AVATAR };

/** Inicial do cliente (ou do atendente) num círculo de cor fixa por nome. */
export function SessionAvatar({ name, phone, size = "md" }: Props) {
  const texto = name || phone || "?";
  const label = (texto[0] ?? "?").toUpperCase();
  return (
    <div
      className={`${TAMANHO_DO_AVATAR[size]} ${findCorDoAvatar(texto)} flex shrink-0 items-center justify-center rounded-full font-semibold text-on-color`}
    >
      {label}
    </div>
  );
}
