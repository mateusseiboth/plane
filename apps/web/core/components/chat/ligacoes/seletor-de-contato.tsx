/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { Plus, Search, UserRound, X } from "lucide-react";
import type { TEntityContact } from "@plane/types";
import { ContatoFormModal, descricaoDoContato } from "@/components/entity-contacts";
import useDebounce from "@/hooks/use-debounce";
import { useEntityContacts } from "@/hooks/use-entity-contacts";

/** Duas letras já filtram bem; menos que isso buscaria a base inteira. */
const MINIMO_PARA_BUSCAR = 2;

const CAIXA =
  "w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";

type Props = {
  workspaceSlug: string;
  value: TEntityContact | null;
  onChange: (contato: TEntityContact | null) => void;
  nomeInicial?: string | null;
  telefoneInicial?: string | null;
  error?: string;
};

/**
 * Escolhe quem ligou no cadastro de Responsáveis, ou cadastra na hora.
 *
 * É o mesmo cadastro das entidades e da visita técnica. O modal de encerramento
 * do chat tem a mesma busca embutida; ver pendência em .claude/ligacoes-freepbx.md.
 */
export function SeletorDeContato({ workspaceSlug, value, onChange, nomeInicial, telefoneInicial, error }: Props) {
  const [busca, setBusca] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const termo = useDebounce(busca.trim(), 300);
  const buscando = termo.length >= MINIMO_PARA_BUSCAR;
  const { contacts, isLoading } = useEntityContacts(buscando ? workspaceSlug : undefined, {
    search: termo,
    is_active: true,
  });

  const selecionar = (contato: TEntityContact) => {
    onChange(contato);
    setBusca("");
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-start gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-13 text-primary">{value.name}</p>
            {descricaoDoContato(value) && (
              <p className="truncate text-11 text-secondary">{descricaoDoContato(value)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Trocar de contato"
            className="rounded p-1 text-secondary hover:bg-surface-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar contato por nome, e-mail ou telefone"
              className={`${CAIXA} pl-8`}
            />
          </div>
          {buscando && (
            <div className="max-h-44 overflow-y-auto rounded-md border border-subtle">
              {contacts.map((contato) => (
                <button
                  key={contato.id}
                  type="button"
                  onClick={() => selecionar(contato)}
                  className="block w-full px-3 py-2 text-left hover:bg-layer-1"
                >
                  <p className="truncate text-13 text-primary">{contato.name}</p>
                  {descricaoDoContato(contato) && (
                    <p className="truncate text-11 text-secondary">{descricaoDoContato(contato)}</p>
                  )}
                </button>
              ))}
              {contacts.length === 0 && (
                <p className="px-3 py-2 text-12 text-secondary">
                  {isLoading ? "Buscando…" : "Nenhum contato encontrado."}
                </p>
              )}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => setCadastroAberto(true)}
        className="flex items-center gap-1.5 text-12 text-accent-primary hover:underline"
      >
        <Plus className="h-3.5 w-3.5" />
        Cadastrar contato
      </button>
      {error && <p className="text-11 text-danger-primary">{error}</p>}

      <ContatoFormModal
        open={cadastroAberto}
        onClose={() => setCadastroAberto(false)}
        workspaceSlug={workspaceSlug}
        entityId={null}
        nomeInicial={nomeInicial ?? ""}
        telefoneInicial={telefoneInicial ?? ""}
        onSaved={selecionar}
      />
    </div>
  );
}
