/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState, type ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { ArrowLeft, Megaphone } from "lucide-react";
import { cn } from "@plane/utils";
import { AbaConfiguracao } from "@/components/chat/disparo/aba-configuracao";
import { AbaEnviar } from "@/components/chat/disparo/aba-enviar";
import { AbaFilaZapi } from "@/components/chat/disparo/aba-fila-zapi";
import { AbaHistorico } from "@/components/chat/disparo/aba-historico";
import { AbaMensagens } from "@/components/chat/disparo/aba-mensagens";
import { ABAS_DO_DISPARO, ACAO_DO_DISPARO, type AbaDoDisparo } from "@/components/chat/disparo/disparo-helpers";
import { useChatConfig } from "@/components/chat/disparo/use-disparo";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";

type Contexto = {
  slug: string;
  apiUrl: string;
  mensagemId: string;
  execucaoId: string | null;
  setMensagemId: (id: string) => void;
  setExecucaoId: (id: string | null) => void;
  goTo: (aba: AbaDoDisparo) => void;
};

/** Uma entrada por aba: aba nova = uma linha aqui. */
const CONTEUDO_DA_ABA: Record<AbaDoDisparo, (c: Contexto) => ReactNode> = {
  mensagens: (c) => (
    <AbaMensagens
      slug={c.slug}
      apiUrl={c.apiUrl}
      onEnviar={(id) => {
        c.setMensagemId(id);
        c.goTo("enviar");
      }}
      onHistorico={(id) => {
        c.setMensagemId(id);
        c.setExecucaoId(null);
        c.goTo("historico");
      }}
    />
  ),
  enviar: (c) => (
    <AbaEnviar
      slug={c.slug}
      apiUrl={c.apiUrl}
      mensagemId={c.mensagemId}
      onMensagemChange={c.setMensagemId}
      onEnviado={(id) => {
        c.setExecucaoId(id);
        c.goTo("historico");
      }}
    />
  ),
  historico: (c) => (
    <AbaHistorico
      slug={c.slug}
      apiUrl={c.apiUrl}
      mensagemId={c.mensagemId}
      execucaoId={c.execucaoId}
      onExecucaoChange={c.setExecucaoId}
    />
  ),
  fila: (c) => <AbaFilaZapi slug={c.slug} apiUrl={c.apiUrl} />,
  configuracao: (c) => <AbaConfiguracao slug={c.slug} apiUrl={c.apiUrl} />,
};

function Aviso({ children }: { children: ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 text-13 text-secondary">{children}</div>;
}

export const DisparoApp = observer(function DisparoApp({ slug }: { slug: string }) {
  const { can, isLoading: carregandoPermissao } = useMyWorkspaceActions(slug);
  const { data: config, isLoading: carregandoConfig } = useChatConfig(slug);
  const [aba, setAba] = useState<AbaDoDisparo>("mensagens");
  const [mensagemId, setMensagemId] = useState("");
  const [execucaoId, setExecucaoId] = useState<string | null>(null);

  if (carregandoPermissao || carregandoConfig) return <Aviso>Carregando…</Aviso>;
  if (!can(ACAO_DO_DISPARO)) return <Aviso>Você não tem permissão para disparar mensagens.</Aviso>;
  if (!config?.enabled) return <Aviso>O chat está desligado neste espaço.</Aviso>;

  const contexto: Contexto = {
    slug,
    apiUrl: config.api_url,
    mensagemId,
    execucaoId,
    setMensagemId,
    setExecucaoId,
    goTo: setAba,
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-3">
        <Link
          href={`/${slug}/chat`}
          className="flex items-center gap-1.5 rounded-md border border-subtle px-3 py-1.5 text-13 text-secondary hover:bg-layer-1 hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar
        </Link>
        <Megaphone className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Disparo de mensagens</span>
      </div>
      <nav className="flex gap-1 border-b border-subtle px-4">
        {ABAS_DO_DISPARO.map((a) => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={cn(
              "border-b-2 px-3 py-2 text-13",
              aba === a.key
                ? "border-accent-primary text-primary"
                : "border-transparent text-secondary hover:text-primary"
            )}
          >
            {a.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{CONTEUDO_DA_ABA[aba](contexto)}</div>
    </div>
  );
});
