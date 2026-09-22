/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, Trash2 } from "lucide-react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import { chatApi, type ChatMotivo } from "@/services/chat.service";

const CAIXA = "w-full rounded-md border border-subtle bg-surface-1 px-2 py-1.5 text-sm text-primary outline-none";

type Config = {
  closeReasons: ChatMotivo[];
  activeIdlePromptMessage: string;
  endOfDayEnabled: boolean;
  endOfDayTime: string | null;
  endOfDayMessage: string;
};

/**
 * Configuração do ciclo de vida da conversa: o catálogo de tipos de motivo do
 * encerramento, a pergunta de inatividade em atendimento e o encerramento
 * automático do WhatsApp no fim do dia.
 */
export function AbaDeEncerramento({ slug, apiUrl }: { slug: string; apiUrl: string }) {
  const api = chatApi(apiUrl);
  const { data, mutate } = useSWR<Config>(["CHAT_CONFIG_ENCERRAMENTO", apiUrl, slug], () => api.getBot(slug), {
    revalidateOnFocus: false,
  });
  const [rascunho, setRascunho] = useState<Config | null>(null);
  const cfg = rascunho ?? data;
  if (!cfg) return <div className="text-sm text-secondary">Carregando…</div>;

  const change = (patch: Partial<Config>) => setRascunho({ ...cfg, ...patch });
  const changeMotivo = (indice: number, label: string) =>
    change({ closeReasons: cfg.closeReasons.map((m, i) => (i === indice ? { ...m, label } : m)) });
  const removeMotivo = (indice: number) => change({ closeReasons: cfg.closeReasons.filter((_, i) => i !== indice) });
  const addMotivo = () =>
    change({ closeReasons: [...cfg.closeReasons, { key: `motivo_${Date.now().toString(36)}`, label: "" }] });

  const save = async () => {
    try {
      await api.saveBot(slug, {
        closeReasons: cfg.closeReasons,
        activeIdlePromptMessage: cfg.activeIdlePromptMessage,
        endOfDayEnabled: cfg.endOfDayEnabled,
        endOfDayTime: cfg.endOfDayTime || null,
        endOfDayMessage: cfg.endOfDayMessage,
      });
      setRascunho(null);
      await mutate();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: "Configuração de encerramento atualizada." });
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Não salvo", message: e?.detail ?? "Tente de novo." });
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-13 font-semibold">Motivos do encerramento</h3>
        <p className="text-12 text-secondary">O atendente escolhe um destes ao encerrar.</p>
        {cfg.closeReasons.map((m, i) => (
          <div key={m.key} className="flex items-center gap-2">
            <input className={CAIXA} value={m.label} onChange={(e) => changeMotivo(i, e.target.value)} />
            <button
              onClick={() => removeMotivo(i)}
              className="rounded p-1.5 text-secondary hover:bg-layer-1"
              title="Remover"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button
          onClick={addMotivo}
          className="flex items-center gap-1 self-start text-12 text-accent-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar motivo
        </button>
      </section>

      <label className="text-sm">
        <span className="mb-1 block text-13 text-secondary">
          Pergunta ao cliente parado há 10 minutos (1 continua, 99 encerra)
        </span>
        <textarea
          className={CAIXA}
          rows={2}
          value={cfg.activeIdlePromptMessage}
          onChange={(e) => change({ activeIdlePromptMessage: e.target.value })}
        />
      </label>

      <section className="flex flex-col gap-2">
        <h3 className="text-13 font-semibold">Fim do dia (WhatsApp)</h3>
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={cfg.endOfDayEnabled}
            onChange={(e) => change({ endOfDayEnabled: e.target.checked })}
          />
          Encerrar as conversas abertas no fim do dia
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-12 text-secondary">Horário (vazio: fim do expediente do dia)</span>
          <input
            type="time"
            className={`${CAIXA} w-32`}
            value={cfg.endOfDayTime ?? ""}
            onChange={(e) => change({ endOfDayTime: e.target.value || null })}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-12 text-secondary">Mensagem ao cliente</span>
          <textarea
            className={CAIXA}
            rows={2}
            value={cfg.endOfDayMessage}
            onChange={(e) => change({ endOfDayMessage: e.target.value })}
          />
        </label>
      </section>

      <button
        onClick={() => void save()}
        className="bg-primary self-start rounded-md px-3 py-1.5 text-13 text-on-color"
      >
        Salvar
      </button>
    </div>
  );
}
