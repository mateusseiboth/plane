/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Pencil, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntityContact } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useEntityContactsOf } from "@/hooks/use-entity-contacts";
// services
import entityContactService from "@/services/entity-contact.service";
// local imports
import { ContatoFormModal } from "./contato-form-modal";
import { descricaoDoContato, mensagemDeErro } from "./helpers";

type Props = {
  workspaceSlug: string;
  entityId: string;
  className?: string;
};

/**
 * Contatos de uma entidade, para uso dentro da própria tela da entidade:
 * lista, cadastra e edita sem sair do lugar.
 */
export const ContatosDaEntidade = observer(function ContatosDaEntidade(props: Props) {
  const { workspaceSlug, entityId, className } = props;

  const { contacts, isLoading, error, refetch } = useEntityContactsOf(workspaceSlug, entityId);
  const [modal, setModal] = useState<{ open: boolean; contact?: TEntityContact | null }>({ open: false });

  const alternarSituacao = async (contact: TEntityContact) => {
    const ativar = contact.is_active === false;
    try {
      await entityContactService.update(workspaceSlug, contact.id, { is_active: ativar });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: ativar ? "Reativado" : "Desativado",
        message: `${contact.name} foi ${ativar ? "reativado" : "desativado"}.`,
      });
      refetch();
    } catch (erro) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: mensagemDeErro(erro, "Falha ao alterar a situação do contato."),
      });
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-secondary-text">Contatos ({contacts.length})</p>
        <button
          type="button"
          onClick={() => setModal({ open: true, contact: null })}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-accent-primary hover:bg-surface-2"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo contato
        </button>
      </div>

      <div className="overflow-hidden rounded border border-subtle">
        {error && (
          <p className="px-3 py-3 text-xs text-secondary-text">
            Não foi possível carregar os contatos desta entidade.
          </p>
        )}

        {!error && isLoading && <p className="px-3 py-3 text-xs text-secondary-text">Carregando contatos...</p>}

        {!error && !isLoading && contacts.length === 0 && (
          <p className="px-3 py-3 text-xs text-secondary-text">Nenhum contato cadastrado nesta entidade.</p>
        )}

        {!error &&
          !isLoading &&
          contacts.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-2 border-b border-subtle px-3 py-2 last:border-0 hover:bg-surface-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-primary">
                  {contact.name}
                  {contact.is_active === false && (
                    <span className="ml-2 rounded-full bg-surface-3 px-1.5 py-0.5 text-11 text-secondary-text">
                      Inativo
                    </span>
                  )}
                </p>
                <p className="truncate text-11 text-secondary-text">{descricaoDoContato(contact) || "—"}</p>
              </div>
              <button
                type="button"
                onClick={() => setModal({ open: true, contact })}
                title="Editar contato"
                className="rounded p-1 text-secondary-text transition-colors hover:bg-surface-3 hover:text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => alternarSituacao(contact)}
                title={contact.is_active === false ? "Reativar contato" : "Desativar contato"}
                className="rounded p-1 text-secondary-text transition-colors hover:bg-surface-3 hover:text-primary"
              >
                {contact.is_active === false ? (
                  <ToggleLeft className="h-3.5 w-3.5" />
                ) : (
                  <ToggleRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
      </div>

      <ContatoFormModal
        open={modal.open}
        onClose={() => setModal({ open: false })}
        workspaceSlug={workspaceSlug}
        contact={modal.contact}
        entityId={entityId}
        travarEntidade
        onSaved={() => refetch()}
      />
    </div>
  );
});
