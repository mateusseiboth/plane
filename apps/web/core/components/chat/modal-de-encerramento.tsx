/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { Plus, Search, UserRound, X } from "lucide-react";
import type { TEntityContact } from "@plane/types";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { ContatoFormModal, descricaoDoContato } from "@/components/entity-contacts";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useEntityContacts } from "@/hooks/use-entity-contacts";

/** O que o encerramento leva para o chat-backend (`agent.close`). */
export type DadosDoEncerramento = {
  project_id?: string;
  contact?: { contact_id: string };
};

type Props = {
  sessao: {
    protocol: string;
    client_name?: string | null;
    client_phone?: string | null;
    project_id?: string | null;
    project_name?: string | null;
    project_identifier?: string | null;
    contact_entity_id?: string | null;
    entity_contact_id?: string | null;
  };
  workspaceSlug: string;
  projetos: { value: string; label: string }[];
  onConfirmar: (dados: DadosDoEncerramento) => void;
  onCancelar: () => void;
};

/** Nada de buscar a base inteira a cada tecla: duas letras já filtram bem. */
const MINIMO_PARA_BUSCAR = 2;

const CAIXA =
  "w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";

/**
 * Encerramento do atendimento: classifica o sistema e diz quem era o cliente.
 *
 * Reproduz o que o SAC antigo fazia — escolher o sistema do suporte e, se a
 * pessoa não estivesse cadastrada, cadastrá-la na hora, sem sair da tela. Sem
 * isso o atendimento fecha sem dizer sobre o que era e o cliente fica anônimo
 * para sempre, porque depois ninguém volta para completar.
 *
 * O contato é o MESMO cadastro do resto do sistema (entidades, visita técnica):
 * quem o chat identificou pelo telefone é quem aparece aqui já selecionado.
 *
 * O sistema só é pedido quando a conversa ainda não virou solicitação: nesse
 * caso ela já carrega o projeto e perguntar de novo seria retrabalho.
 */
export function ModalDeEncerramento({ sessao, workspaceSlug, projetos, onConfirmar, onCancelar }: Props) {
  const precisaDeProjeto = !sessao.project_id;
  const [projeto, setProjeto] = useState("");
  const [busca, setBusca] = useState("");
  const [contatoId, setContatoId] = useState(sessao.entity_contact_id ?? "");
  const [contatoEscolhido, setContatoEscolhido] = useState<TEntityContact | null>(null);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  const termo = useDebounce(busca.trim(), 300);
  const buscando = termo.length >= MINIMO_PARA_BUSCAR;
  const { contacts, isLoading } = useEntityContacts(buscando ? workspaceSlug : undefined, {
    search: termo,
    is_active: true,
  });

  const selecionar = (contato: TEntityContact) => {
    setContatoId(contato.id);
    setContatoEscolhido(contato);
    setBusca("");
  };

  const limparContato = () => {
    setContatoId("");
    setContatoEscolhido(null);
  };

  const confirmar = () =>
    onConfirmar({
      ...(precisaDeProjeto && projeto ? { project_id: projeto } : {}),
      ...(contatoId ? { contact: { contact_id: contatoId } } : {}),
    });

  // Quem o bot identificou pelo telefone chega sem o registro carregado: o nome
  // do atendimento é o do próprio contato, e serve para mostrar a escolha.
  const nomeDoContato = contatoEscolhido?.name ?? (contatoId ? sessao.client_name : null);
  const descricao = contatoEscolhido ? descricaoDoContato(contatoEscolhido) : (sessao.client_phone ?? "");

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancelar}>
        <div
          className="w-full max-w-md rounded-xl border border-subtle bg-surface-1 p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-15 font-semibold text-primary">Encerrar atendimento</h2>
          <p className="mt-1 text-12 text-secondary">
            Protocolo {sessao.protocol}. O cliente recebe a mensagem de encerramento e a pesquisa de satisfação.
          </p>

          <div className="mt-4 space-y-4">
            {precisaDeProjeto ? (
              <div>
                <label className="mb-1 block text-12 font-medium text-secondary">Sistema atendido</label>
                <SelectPesquisavel
                  value={projeto}
                  onChange={setProjeto}
                  opcoes={projetos}
                  placeholder="Selecione o sistema"
                  searchPlaceholder="Buscar sistema"
                />
              </div>
            ) : (
              <p className="rounded-md border border-subtle bg-layer-1 px-3 py-2 text-12 text-secondary">
                Já classificado como{" "}
                <strong className="text-primary">{sessao.project_name ?? sessao.project_identifier}</strong>.
              </p>
            )}

            <div className="space-y-3 rounded-md border border-subtle p-3">
              <p className="text-12 font-medium text-secondary">Contato</p>

              {nomeDoContato ? (
                <div className="flex items-start gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-13 text-primary">{nomeDoContato}</p>
                    {descricao && <p className="truncate text-11 text-secondary">{descricao}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={limparContato}
                    title="Trocar de contato"
                    className="rounded p-1 text-secondary hover:bg-surface-2"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-secondary" />
                    <input
                      autoFocus
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
            </div>
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
              disabled={precisaDeProjeto && !projeto}
              className="rounded-md bg-danger-primary px-3 py-1.5 text-13 text-on-color disabled:cursor-not-allowed disabled:opacity-50"
              title={precisaDeProjeto && !projeto ? "Escolha o sistema atendido" : "Encerrar"}
            >
              Encerrar
            </button>
          </div>
        </div>
      </div>

      {/*
        Fora da caixa de encerramento de propósito: o `onClick` do fundo escuro
        fecha o encerramento, e o React propaga o clique pela árvore de
        componentes mesmo com o portal do diálogo — dentro dali, digitar no
        cadastro fecharia a tela debaixo.
      */}
      <ContatoFormModal
        open={cadastroAberto}
        onClose={() => setCadastroAberto(false)}
        workspaceSlug={workspaceSlug}
        entityId={sessao.contact_entity_id ?? null}
        nomeInicial={sessao.client_name ?? ""}
        telefoneInicial={sessao.client_phone ?? ""}
        onSaved={selecionar}
      />
    </>
  );
}
