/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { ModalDeChamado, type PedidoDeChamado } from "@/components/chat/modal-de-chamado";
// services
import { ChatService, chatApi, type ChatMessage, type ChatSession } from "@/services/chat.service";

const chatService = new ChatService();

const mensagemDoErro = (e: unknown, padrao: string) => (e as { detail?: string } | null)?.detail ?? padrao;

type Props = {
  sessao: ChatSession;
  slug: string;
  apiUrl: string;
  projetos: { value: string; label: string }[];
  /** Endereço da conversa (vai no chamado como link). */
  chatUrl: string;
  onAtualizada: (sessao: ChatSession) => void;
};

/** Pausar e retomar valem para conversa escrita em atendimento; ligação não pausa. */
const PAUSA_DO_STATUS: Record<string, "pause" | "resume"> = { active: "pause", paused: "resume" };

/**
 * Ações do ciclo de vida da conversa: abrir o chamado e pausar/retomar o
 * atendimento. Quem mostra o botão (e decide se cabe no cabeçalho ou vai para o
 * menu "Mais") é o `CabecalhoDaConversa`; aqui ficam os handlers e o modal.
 */
export function useAcoesDaConversa({ sessao, slug, apiUrl, projetos, chatUrl, onAtualizada }: Props) {
  const [abrindoChamado, setAbrindoChamado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const api = chatApi(apiUrl);
  const pausa = PAUSA_DO_STATUS[sessao.status] ?? "pause";

  const createChamado = async ({ projectId, dados }: PedidoDeChamado) => {
    setEnviando(true);
    try {
      const chamado = await chatService.createChamadoFromChat(slug, projectId, {
        ...dados,
        session_id: sessao.id,
        chat_url: chatUrl,
      });
      onAtualizada(await api.linkChamado(slug, sessao.id, chamado.issue.id));
      setAbrindoChamado(false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: `Chamado ${chamado.issue.label} aberto`,
        message: chamado.anexos_falharam
          ? `${chamado.anexos_falharam} arquivo(s) não foram anexados. A conversa está na descrição.`
          : "A conversa e os arquivos foram anexados.",
      });
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Chamado não aberto", message: mensagemDoErro(e, "Tente de novo.") });
    } finally {
      setEnviando(false);
    }
  };

  const changePausa = async () => {
    try {
      onAtualizada(await (pausa === "pause" ? api.pauseSession : api.resumeSession)(slug, sessao.id));
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não foi possível", message: mensagemDoErro(e, "Tente de novo.") });
    }
  };

  const modalDoChamado = abrindoChamado && (
    <ModalDeChamado
      sessao={sessao}
      workspaceSlug={slug}
      projetos={projetos}
      onConfirmar={(pedido) => void createChamado(pedido)}
      onCancelar={() => setAbrindoChamado(false)}
      enviando={enviando}
    />
  );

  return {
    pausa,
    openChamado: () => setAbrindoChamado(true),
    changePausa: () => void changePausa(),
    modalDoChamado,
  };
}

/** Mensagem que não chegou ao WhatsApp: o atendente vê e reenvia. */
export function FalhaDeEnvio({
  mensagem,
  slug,
  apiUrl,
  onReenviada,
}: {
  mensagem: ChatMessage;
  slug: string;
  apiUrl: string;
  onReenviada: (mensagem: ChatMessage) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  if (mensagem.status !== "failed") return null;

  const resend = async () => {
    setEnviando(true);
    try {
      onReenviada(await chatApi(apiUrl).resendMessage(slug, mensagem.id));
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não reenviada", message: mensagemDoErro(e, "Tente de novo.") });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <span className="flex items-center gap-1 text-danger-primary" title={mensagem.send_error ?? undefined}>
      <AlertCircle className="h-3 w-3" />
      Não enviada
      <button onClick={() => void resend()} disabled={enviando} className="underline disabled:opacity-50">
        {enviando ? "Reenviando…" : "Reenviar"}
      </button>
    </span>
  );
}
