/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import Link from "next/link";
import { Building2, Check, Layers } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, generateWorkItemLink } from "@plane/utils";
// services
import type { TTarefaDaHome } from "@/services/home-painel.service";
// local imports
import { formatPrazoRelativo, readReferenciaDoChamado } from "./painel-rules";

/** Pastilha de prioridade: as cores são os tokens de prioridade do tema. */
const PRIORIDADES: Record<string, { rotulo: string; classe: string }> = {
  urgent: { rotulo: "Urgente", classe: "border-priority-urgent text-priority-urgent" },
  high: { rotulo: "Alta", classe: "border-priority-high text-priority-high" },
  medium: { rotulo: "Média", classe: "border-priority-medium text-priority-medium" },
  low: { rotulo: "Baixa", classe: "border-priority-low text-priority-low" },
};

function PastilhaDePrioridade({ prioridade }: { prioridade: string }) {
  const estilo = PRIORIDADES[prioridade];
  if (!estilo) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        estilo.classe
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {estilo.rotulo}
    </span>
  );
}

function Etiqueta({ icone: Icone, texto }: { icone: typeof Layers; texto: string }) {
  return (
    <span className="inline-flex max-w-44 items-center gap-1 rounded-md bg-layer-1 px-1.5 py-0.5 text-11 text-secondary dark:bg-layer-2">
      <Icone aria-hidden className="size-3 shrink-0 text-tertiary" />
      <span className="truncate">{texto}</span>
    </span>
  );
}

type Props = {
  tarefa: TTarefaDaHome;
  workspaceSlug: string;
  agora: Date;
  isAtrasada: boolean;
  isConcluindo: boolean;
  onComplete: (tarefa: TTarefaDaHome) => Promise<void>;
};

/** A API devolve `{ detail }` quando a função não permite a transição. */
const readMensagemDeErro = (erro: unknown) =>
  (erro as { detail?: string } | undefined)?.detail ?? "Não foi possível concluir o chamado. Tente de novo.";

/** Uma tarefa: checkbox de concluir (com confirmação na própria linha), título, etiquetas e prazo. */
export function TarefaLinha({ tarefa, workspaceSlug, agora, isAtrasada, isConcluindo, onComplete }: Props) {
  const [isConfirmando, setConfirmando] = useState(false);
  const referencia = readReferenciaDoChamado(tarefa);
  const link = generateWorkItemLink({
    workspaceSlug,
    projectId: tarefa.project_id,
    issueId: tarefa.id,
    projectIdentifier: tarefa.project_identifier,
    sequenceId: tarefa.sequence_id,
  });

  const onConfirm = async () => {
    try {
      await onComplete(tarefa);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Chamado concluído", message: `${referencia} foi concluído.` });
    } catch (erro) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Chamado não concluído", message: readMensagemDeErro(erro) });
    } finally {
      setConfirmando(false);
    }
  };

  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-layer-1 dark:hover:bg-layer-2">
      <span className="relative mt-0.5 flex size-4 shrink-0">
        <input
          type="checkbox"
          checked={isConcluindo}
          aria-label={`Concluir o chamado ${referencia}`}
          disabled={!tarefa.completed_state_id || isConcluindo}
          onChange={() => setConfirmando(true)}
          className="peer size-4 cursor-pointer appearance-none rounded-full border border-strong transition-colors checked:border-accent-strong checked:bg-accent-primary hover:border-accent-strong focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <Check
          aria-hidden
          className="pointer-events-none absolute inset-0.5 hidden size-3 text-on-color peer-checked:block"
        />
      </span>

      <div className="min-w-0 flex-1">
        {isConfirmando ? (
          <div className="flex flex-wrap items-center gap-2 text-13">
            <span className="text-primary">Concluir o chamado {referencia}?</span>
            <button
              type="button"
              onClick={() => void onConfirm()}
              className="rounded-md bg-accent-primary px-2 py-0.5 text-12 font-medium text-on-color hover:bg-accent-primary-hover focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
            >
              Concluir
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-md px-2 py-0.5 text-12 text-secondary hover:bg-layer-1 focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <Link
            href={link}
            className="line-clamp-1 rounded text-13 text-primary hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:outline-none"
          >
            <span className="font-medium text-accent-primary">{referencia}</span>
            <span className="text-tertiary"> · </span>
            <span>{tarefa.name}</span>
          </Link>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Etiqueta icone={Layers} texto={tarefa.project_name} />
          {tarefa.entity_name && <Etiqueta icone={Building2} texto={tarefa.entity_name} />}
          <PastilhaDePrioridade prioridade={tarefa.priority} />
        </div>
      </div>

      {tarefa.target_date && (
        <time
          dateTime={tarefa.target_date}
          className={cn(
            "shrink-0 pt-0.5 text-12 whitespace-nowrap",
            isAtrasada ? "font-medium text-danger-primary" : "text-tertiary"
          )}
        >
          {formatPrazoRelativo(tarefa.target_date, agora)}
        </time>
      )}
    </li>
  );
}
