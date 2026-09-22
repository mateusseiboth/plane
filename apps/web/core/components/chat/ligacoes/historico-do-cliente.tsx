/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { MessageSquare, PhoneCall, PhoneMissed } from "lucide-react";
import { formatDuracao, isLigacao } from "@/components/chat/ligacoes/ligacao-helpers";
import { useHistoricoDoCliente } from "@/components/chat/ligacoes/use-ligacoes";
import type { ItemDoHistorico } from "@/services/ligacoes.service";

type Props = { slug: string; apiUrl: string; sessionId: string; versao: string };

const formatDia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function IconeDoItem({ item }: { item: ItemDoHistorico }) {
  if (!isLigacao(item)) return <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />;
  if (item.ligacao?.status === "missed")
    return <PhoneMissed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-primary" />;
  return <PhoneCall className="text-green-600 mt-0.5 h-3.5 w-3.5 shrink-0" />;
}

function Item({ slug, item, atual }: { slug: string; item: ItemDoHistorico; atual: boolean }) {
  const detalhes = [
    item.project_identifier ?? item.project_name,
    item.attendant_name,
    formatDuracao(item.ligacao?.duration_sec),
    item.ligacao?.ticket_label && `Chamado ${item.ligacao.ticket_label}`,
  ].filter(Boolean);
  return (
    <a
      href={`/${slug}/chat-view/${item.protocol}`}
      target="_blank"
      rel="noreferrer"
      className={`flex gap-2 rounded-md px-2 py-1.5 hover:bg-layer-1 ${atual ? "bg-layer-1" : ""}`}
    >
      <IconeDoItem item={item} />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 text-12">
          <span className="font-medium text-primary">{isLigacao(item) ? "Ligação" : "Conversa"}</span>
          <span className="shrink-0 text-tertiary">{formatDia(item.created_at)}</span>
        </div>
        {detalhes.length > 0 && <p className="truncate text-11 text-secondary">{detalhes.join(" · ")}</p>}
        {item.ligacao?.descricao && <p className="line-clamp-2 text-11 text-tertiary">{item.ligacao.descricao}</p>}
      </div>
    </a>
  );
}

/** Conversas e ligações anteriores da mesma pessoa (pelo cadastro ou pelo telefone). */
export function HistoricoDoCliente({ slug, apiUrl, sessionId, versao }: Props) {
  const { data, isLoading } = useHistoricoDoCliente(apiUrl, slug, sessionId, versao);
  return (
    <div className="border-b border-subtle p-4">
      <div className="tracking-wider mb-2 text-11 font-semibold text-tertiary uppercase">Histórico do cliente</div>
      {isLoading && <p className="text-12 text-tertiary">Carregando…</p>}
      {!isLoading && data.length === 0 && <p className="text-12 text-tertiary">Nenhum atendimento anterior.</p>}
      <div className="flex flex-col gap-0.5">
        {data.map((item) => (
          <Item key={item.id} slug={slug} item={item} atual={item.id === sessionId} />
        ))}
      </div>
    </div>
  );
}
