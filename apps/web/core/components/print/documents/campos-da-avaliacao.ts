/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChatSession } from "@/services/chat.service";

type Avaliacao = Pick<ChatSession, "rating_score" | "rating_comment">;

/**
 * Campos da avaliação do cliente na transcrição impressa. Sem
 * `chat.ver_avaliacao` não há campo nenhum: o servidor já não manda a nota, e
 * um "—" daria a entender que o cliente não avaliou.
 */
export function buildCamposDaAvaliacao(session: Avaliacao, canVerAvaliacao: boolean) {
  if (!canVerAvaliacao) return [];
  return [
    { label: "Avaliação", value: session.rating_score != null ? String(session.rating_score) : "—" },
    { label: "Comentário da avaliação", value: session.rating_comment ?? "—" },
  ];
}
