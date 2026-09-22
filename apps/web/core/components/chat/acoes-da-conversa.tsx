/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Pause, Play, Ticket } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { ModalDeChamado, type PedidoDeChamado } from "@/components/chat/modal-de-chamado";
// services
import { ChatService, chatApi, type ChatMessage, type ChatSession } from "@/services/chat.service";

const chatService = new ChatService();

const BOTAO =
  "flex items-center gap-1 rounded-md border border-subtle px-2.5 py-1.5 text-12 text-secondary transition-colors hover:bg-layer-1 disabled:opacity-50";

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
const PODE_PAUSAR: Record<string, "pause" | "resume"> = { active: "pause", paused: "resume" };

/**
 * Ações do ciclo de vida no cabeçalho da conversa: abrir o chamado (ou ir até
 * ele, quando já existe) e pausar/retomar o atendimento.
 */
export function AcoesDaConversa({ sessao, slug, apiUrl, projetos, chatUrl, onAtualizada }: Props) {
  const [abrindoChamado, setAbrindoChamado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const api = chatApi(apiUrl);
  const pausa = sessao.channel === "phone" ? undefined : PODE_PAUSAR[sessao.status];

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
    if (!pausa) return;
    try {
      onAtualizada(await (pausa === "pause" ? api.pauseSession : api.resumeSession)(slug, sessao.id));
    } catch (e) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não foi possível", message: mensagemDoErro(e, "Tente de novo.") });
    }
  };

  return (
    <>
      {sessao.issue_label ? (
        <Link href={`/${slug}/browse/${sessao.issue_label}/`} className={BOTAO} title="Abrir o chamado desta conversa">
          <Ticket className="h-3.5 w-3.5" />
          {sessao.issue_label}
        </Link>
      ) : (
        <button onClick={() => setAbrindoChamado(true)} className={BOTAO} title="Abrir chamado com esta conversa">
          <Ticket className="h-3.5 w-3.5" />
          Chamado
        </button>
      )}
      {pausa && (
        <button onClick={changePausa} className={BOTAO} title={pausa === "pause" ? "Pausar atendimento" : "Retomar"}>
          {pausa === "pause" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {pausa === "pause" ? "Pausar" : "Retomar"}
        </button>
      )}
      {abrindoChamado && (
        <ModalDeChamado
          sessao={sessao}
          workspaceSlug={slug}
          projetos={projetos}
          onConfirmar={(pedido) => void createChamado(pedido)}
          onCancelar={() => setAbrindoChamado(false)}
          enviando={enviando}
        />
      )}
    </>
  );
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
