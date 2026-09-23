/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { ArrowRightLeft, CheckCircle2, History, Inbox, MessageSquare, PlusCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, generateWorkItemLink } from "@plane/utils";
// hooks
import { useAtividadeDaHome } from "@/hooks/use-home-painel";
// services
import type { TEventoDaHome, TTipoDeEvento } from "@/services/home-painel.service";
// local imports
import { CartaoDoPainel, EsqueletoDoCartao, VazioDoCartao } from "./cartao";
import { buildTextoDoEvento, formatTempoRelativo } from "./painel-rules";

/** Ícone e tom de cada tipo de evento. */
const APARENCIA_DO_EVENTO: Record<TTipoDeEvento, { icone: LucideIcon; classe: string }> = {
  abertura: { icone: PlusCircle, classe: "bg-accent-subtle text-accent-primary" },
  etapa: { icone: ArrowRightLeft, classe: "bg-layer-1 text-secondary dark:bg-layer-2" },
  conclusao: { icone: CheckCircle2, classe: "bg-success-subtle text-success-primary" },
  comentario: { icone: MessageSquare, classe: "bg-accent-subtle text-accent-primary" },
  solicitacao_atendida: { icone: Inbox, classe: "bg-success-subtle text-success-primary" },
};

function ItemDaAtividade({
  evento,
  workspaceSlug,
  agora,
  isUltimo,
}: {
  evento: TEventoDaHome;
  workspaceSlug: string;
  agora: Date;
  isUltimo: boolean;
}) {
  const { icone: Icone, classe } = APARENCIA_DO_EVENTO[evento.tipo];
  const { acao, referencia, complemento } = buildTextoDoEvento(evento);
  const link = generateWorkItemLink({
    workspaceSlug,
    projectId: evento.chamado.project_id,
    issueId: evento.chamado.id,
    projectIdentifier: evento.chamado.project_identifier,
    sequenceId: evento.chamado.sequence_id,
  });

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {/* Fio da linha do tempo: liga um ícone ao próximo. */}
      {!isUltimo && <span aria-hidden className="absolute top-8 bottom-1 left-3.5 w-px bg-layer-3" />}
      <span className={cn("relative flex size-7 shrink-0 items-center justify-center rounded-full", classe)}>
        <Icone aria-hidden className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="min-w-0 text-13 text-secondary">
            {acao}{" "}
            <Link
              href={link}
              title={evento.chamado.name}
              className="rounded font-medium text-accent-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
            >
              {referencia}
            </Link>
            {complemento && <span className="text-primary"> {complemento}</span>}
          </p>
          <time dateTime={evento.criado_em} className="shrink-0 text-11 text-tertiary">
            {formatTempoRelativo(evento.criado_em, agora)}
          </time>
        </div>
        <p className="mt-0.5 truncate text-12 text-tertiary">
          {evento.chamado.name} · {evento.chamado.project_name}
        </p>
        {evento.comentario && (
          <blockquote className="mt-2 rounded-lg border border-subtle bg-layer-1 px-3 py-2 text-12 leading-relaxed text-secondary dark:bg-layer-2">
            {evento.comentario}
          </blockquote>
        )}
      </div>
    </li>
  );
}

export function AtividadeDaHome({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: eventos, isLoading, isFetching } = useAtividadeDaHome(workspaceSlug);
  const agora = new Date();

  const conteudo = () => {
    if (isLoading) return <EsqueletoDoCartao linhas={4} />;
    if (!eventos?.length)
      return (
        <VazioDoCartao
          icone={History}
          titulo="Nenhuma atividade ainda"
          detalhe="Chamados que você abrir, mover, concluir ou comentar aparecem aqui."
        />
      );
    return (
      <ol className="flex flex-col">
        {eventos.map((evento, indice) => (
          <ItemDaAtividade
            key={`${evento.tipo}-${evento.id}`}
            evento={evento}
            workspaceSlug={workspaceSlug}
            agora={agora}
            isUltimo={indice === eventos.length - 1}
          />
        ))}
      </ol>
    );
  };

  return (
    <CartaoDoPainel titulo="Atividade" subtitulo="O que você fez nos chamados" isAtualizando={isFetching && !isLoading}>
      {conteudo()}
    </CartaoDoPainel>
  );
}
