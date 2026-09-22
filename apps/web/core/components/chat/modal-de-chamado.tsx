/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
// hooks
import { useModulosDoSistema } from "@/hooks/use-chat-atendimento";
// services
import type { NovoChamadoDoChat } from "@/services/chat.service";

export type PedidoDeChamado = { projectId: string; dados: Omit<NovoChamadoDoChat, "session_id" | "chat_url"> };

type Props = {
  sessao: { protocol: string; client_name?: string | null; client_phone?: string | null; project_id?: string | null };
  workspaceSlug: string;
  projetos: { value: string; label: string }[];
  onConfirmar: (pedido: PedidoDeChamado) => void;
  onCancelar: () => void;
  enviando?: boolean;
};

const CAIXA =
  "w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";

/**
 * Abre o chamado a partir da conversa. A transcrição e os arquivos vão juntos
 * (o servidor monta), então aqui só se pede o que a conversa não sabe: o
 * sistema, o título, se o cliente está parado (prioridade urgente) e o módulo.
 */
export function ModalDeChamado({ sessao, workspaceSlug, projetos, onConfirmar, onCancelar, enviando = false }: Props) {
  const quem = sessao.client_name || sessao.client_phone || "Cliente";
  const [projeto, setProjeto] = useState(sessao.project_id ?? "");
  const [titulo, setTitulo] = useState(`Chat ${sessao.protocol}: ${quem}`);
  const [clienteParado, setClienteParado] = useState(false);
  const [modulo, setModulo] = useState("");
  const [complemento, setComplemento] = useState("");
  const { modulos } = useModulosDoSistema(workspaceSlug, projeto);

  const escolherProjeto = (valor: string) => {
    setProjeto(valor);
    setModulo("");
  };

  const confirmar = () =>
    onConfirmar({
      projectId: projeto,
      dados: {
        name: titulo.trim(),
        priority: clienteParado ? "urgent" : "none",
        ...(modulo ? { module_id: modulo } : {}),
        ...(complemento.trim() ? { description_html: complemento.trim() } : {}),
      },
    });

  const pendencia = [
    [!projeto, "Escolha o sistema."],
    [!titulo.trim(), "Informe o título."],
  ].find(([falta]) => falta)?.[1] as string | undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancelar}
      role="presentation"
    >
      <div
        className="shadow-xl w-full max-w-md rounded-xl border border-subtle bg-surface-1 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      >
        <h2 className="text-15 font-semibold text-primary">Abrir chamado</h2>
        <p className="mt-1 text-12 text-secondary">A conversa e os arquivos vão anexados ao chamado.</p>

        <div className="mt-4 space-y-4">
          <div>
            <p className="mb-1 block text-12 font-medium text-secondary">Sistema</p>
            <SelectPesquisavel
              value={projeto}
              onChange={escolherProjeto}
              opcoes={projetos}
              placeholder="Selecione o sistema"
              searchPlaceholder="Buscar sistema"
            />
          </div>

          <div>
            <p className="mb-1 block text-12 font-medium text-secondary">Título</p>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={250} className={CAIXA} />
          </div>

          <div>
            <p className="mb-1 block text-12 font-medium text-secondary">Módulo</p>
            <SelectPesquisavel
              value={modulo}
              onChange={setModulo}
              opcoes={modulos}
              opcaoVazia={{ value: "", label: "Nenhum" }}
              placeholder="Opcional"
              searchPlaceholder="Buscar módulo"
              disabled={!projeto}
            />
          </div>

          <div>
            <p className="mb-1 block text-12 font-medium text-secondary">Complemento</p>
            <textarea
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              rows={3}
              placeholder="Opcional"
              className={CAIXA}
            />
          </div>

          <label className="flex items-center gap-2 text-13 text-primary">
            <input type="checkbox" checked={clienteParado} onChange={(e) => setClienteParado(e.target.checked)} />
            Cliente parado (prioridade urgente)
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="rounded-md border border-subtle px-3 py-1.5 text-13 text-secondary hover:bg-layer-1"
          >
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={Boolean(pendencia) || enviando}
            title={pendencia ?? "Abrir chamado"}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-13 text-on-color disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Abrindo…" : "Abrir chamado"}
          </button>
        </div>
      </div>
    </div>
  );
}
