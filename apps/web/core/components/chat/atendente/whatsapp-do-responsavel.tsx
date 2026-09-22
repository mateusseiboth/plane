/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import type { TEntityContact } from "@plane/types";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { SeletorDeContato } from "@/components/chat/ligacoes/seletor-de-contato";
import { readErroDoCampo } from "@/components/chat/atendente/atendente-helpers";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// services
import { atendenteApi, type ErroDoChat } from "@/services/atendente.service";
import { ChatService } from "@/services/chat.service";

const chatService = new ChatService();

/**
 * Abre (ou reencontra) a conversa de WhatsApp com o responsável. Já existindo
 * conversa aberta com o número, o servidor responde 409 com ela, e é essa que
 * o atendente passa a ver.
 */
async function startConversa(apiUrl: string, slug: string, dados: { entity_contact_id: string; message?: string }) {
  try {
    const sessao = await atendenteApi(apiUrl).startWhatsappDoResponsavel(slug, dados);
    return { sessionId: sessao.id, erro: null };
  } catch (e) {
    const recusa = e as ErroDoChat;
    return { sessionId: recusa?.session_id ?? null, erro: recusa?.session_id ? null : recusa };
  }
}

/**
 * Bloco do "Novo atendimento": escolher o responsável no cadastro de
 * Responsáveis e iniciar a conversa já com entidade e sistema.
 */
export function IniciarPeloResponsavel({
  slug,
  apiUrl,
  mensagem,
  onCreated,
}: {
  slug: string;
  apiUrl: string;
  /** Mensagem inicial digitada no mesmo modal. */
  mensagem?: string;
  onCreated: (sessionId: string) => void;
}) {
  const [contato, setContato] = useState<TEntityContact | null>(null);
  const [erro, setErro] = useState<ErroDoChat | null>(null);
  const [enviando, setEnviando] = useState(false);

  const start = async () => {
    if (!contato) return;
    setEnviando(true);
    const { sessionId, erro: recusa } = await startConversa(apiUrl, slug, {
      entity_contact_id: contato.id,
      message: mensagem || undefined,
    });
    setEnviando(false);
    setErro(recusa);
    if (sessionId) return onCreated(sessionId);
    if (!recusa?.errors?.length)
      setToast({ type: TOAST_TYPE.ERROR, title: "Conversa não iniciada", message: recusa?.detail ?? "Tente de novo." });
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-12 font-medium text-secondary">Responsável (cadastro do cliente)</span>
      <SeletorDeContato
        workspaceSlug={slug}
        value={contato}
        onChange={setContato}
        error={readErroDoCampo(erro, "entity_contact_id")}
      />
      {contato && (
        <button
          type="button"
          onClick={() => void start()}
          disabled={enviando}
          className="bg-primary text-sm flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-medium text-on-color disabled:opacity-50"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Iniciar conversa com {contato.name}
        </button>
      )}
    </div>
  );
}

/**
 * Botão da tela de contatos: inicia a conversa de WhatsApp com o responsável e
 * abre o atendimento nela.
 */
export function BotaoDeWhatsapp({ slug, contato }: { slug: string; contato: TEntityContact }) {
  const router = useAppRouter();
  const { can } = useMyWorkspaceActions(slug);
  const [enviando, setEnviando] = useState(false);
  // Só quem atende no chat conversa; sem telefone, não há o que abrir.
  if (!contato.phone || !can("chat.atender")) return null;

  const start = async () => {
    setEnviando(true);
    try {
      const { api_url } = await chatService.getConfig(slug);
      const { sessionId, erro } = await startConversa(api_url, slug, { entity_contact_id: contato.id });
      if (sessionId) return router.push(`/${slug}/chat/?sessao=${sessionId}`);
      setToast({ type: TOAST_TYPE.ERROR, title: "Conversa não iniciada", message: erro?.detail ?? "Tente de novo." });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Conversa não iniciada", message: "O chat não está disponível." });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void start()}
      disabled={enviando}
      title="Conversar no WhatsApp"
      className="text-secondary-text hover:bg-surface-3 rounded p-1 transition-colors hover:text-primary disabled:opacity-50"
    >
      {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
    </button>
  );
}
