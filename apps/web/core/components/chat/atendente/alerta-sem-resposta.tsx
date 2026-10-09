/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// local imports
import { rotuloDoAlertaPausado } from "@/components/chat/atendente/atendente-helpers";
import { useAtendenteApi } from "@/components/chat/atendente/use-atendente";
import type { ChatSession } from "@/services/chat.service";

/**
 * Pausar o alerta de cliente sem resposta desta conversa (o cliente avisou que
 * ia verificar algo). Volta sozinho em 40 minutos. Legado:
 * `popChatAt_pausar_alerta_semresp.php`. O botão é do `CabecalhoDaConversa`.
 */
export function useAlertaSemResposta({
  sessao,
  slug,
  apiUrl,
  onAtualizada,
}: {
  sessao: ChatSession;
  slug: string;
  apiUrl: string;
  onAtualizada: (sessao: ChatSession) => void;
}) {
  const api = useAtendenteApi(apiUrl);
  const [enviando, setEnviando] = useState(false);
  const pausado = rotuloDoAlertaPausado(sessao.sla_alert_paused_until);

  const change = async () => {
    setEnviando(true);
    try {
      onAtualizada(await (pausado ? api.resumeAlerta : api.pauseAlerta)(slug, sessao.id));
    } catch (e) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível",
        message: (e as { detail?: string })?.detail ?? "Tente de novo.",
      });
    } finally {
      setEnviando(false);
    }
  };

  return { pausado, enviando, changeAlerta: () => void change() };
}

/** Mensagem do tipo `chave`: o código em destaque e um botão de copiar. */
export function MensagemDaChave({ chave }: { chave: string }) {
  const copy = async () => {
    await navigator.clipboard.writeText(chave).catch(() => undefined);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Chave copiada", message: chave });
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-11 opacity-80">Chave de acesso remoto</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-sm font-semibold break-all">{chave}</span>
        <button
          type="button"
          onClick={() => void copy()}
          title="Copiar"
          className="rounded p-0.5 opacity-80 hover:opacity-100"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </span>
    </div>
  );
}
