/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// services
import type { ChatMessage, ChatSession } from "@/services/chat.service";
// local imports
import { PrintDocument } from "../print-document";
import { PrintFields, PrintSection } from "../print-section";

type Props = {
  session: ChatSession;
  messages: ChatMessage[];
};

const SENDER_LABELS: Record<ChatMessage["sender"], string> = {
  client: "Cliente",
  bot: "Atendimento automático",
  attendant: "Atendente",
  system: "Sistema",
};

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  web: "Chat",
};

const formatDateTime = (value?: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

const messageBody = (message: ChatMessage) => {
  if (message.deleted_at) return "(mensagem apagada)";
  if (message.text) return message.text;
  if (message.media_name) return `[anexo] ${message.media_name}`;
  if (message.media_key) return `[${message.type}]`;
  return "—";
};

/** Transcrição completa de um atendimento, pronta para impressão. */
export const ChatTranscriptPrintDocument = function ChatTranscriptPrintDocument(props: Props) {
  const { session, messages } = props;

  const clientName = session.client_name || session.client_phone || "Atendimento";

  return (
    <PrintDocument
      title={`Atendimento #${session.protocol}`}
      subtitle={clientName}
      meta={[
        { label: "Canal", value: CHANNEL_LABELS[session.channel] ?? session.channel },
        { label: "Situação", value: session.status },
        { label: "Mensagens", value: String(messages.length) },
      ]}
    >
      <PrintSection title="Dados do atendimento">
        <PrintFields
          items={[
            { label: "Protocolo", value: session.protocol },
            { label: "Cliente", value: clientName },
            { label: "Telefone", value: session.client_phone ?? "—" },
            { label: "Canal", value: CHANNEL_LABELS[session.channel] ?? session.channel },
            { label: "Situação", value: session.status },
            { label: "Projeto", value: session.project_name ?? "—" },
            { label: "Aberto em", value: formatDateTime(session.created_at) },
            { label: "Avaliação", value: session.rating_score != null ? String(session.rating_score) : "—" },
            { label: "Comentário da avaliação", value: session.rating_comment ?? "—" },
          ]}
        />
      </PrintSection>

      <PrintSection title="Transcrição">
        {messages.length === 0 ? (
          <p>Nenhuma mensagem registrada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map((message) => (
              <article key={message.id} className="print-avoid-break border-b border-neutral-200 pb-1 last:border-0">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-500">
                  {message.sender_name || SENDER_LABELS[message.sender] || message.sender}
                  <span className="ml-2 font-normal normal-case tracking-normal">
                    {formatDateTime(message.created_at)}
                  </span>
                  {message.edited_at && <span className="ml-2 font-normal normal-case">(editada)</span>}
                </p>
                <p className="whitespace-pre-wrap">{messageBody(message)}</p>
              </article>
            ))}
          </div>
        )}
      </PrintSection>
    </PrintDocument>
  );
};
