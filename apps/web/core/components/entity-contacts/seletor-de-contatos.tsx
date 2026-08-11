/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, UserRound, X } from "lucide-react";
import type { ICustomSearchSelectOption, TEntityContact } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
// hooks
import { useEntityContactsOf } from "@/hooks/use-entity-contacts";
// local imports
import { descricaoDoContato } from "./helpers";
import { ContatoFormModal } from "./contato-form-modal";

type Props = {
  workspaceSlug: string;
  /** Entidade da visita; sem ela não há de quem escolher. */
  entityId: string | null | undefined;
  value: string[];
  onChange: (contactIds: string[]) => void;
  /**
   * Pessoas já vinculadas à visita (`contact_records`). Entram na lista mesmo
   * que a entidade tenha mudado depois, para o nome não sumir da tela.
   */
  contatosConhecidos?: TEntityContact[];
  /** Texto solto do SAC. Continua na tela: não dá para reconstituir em pessoas. */
  textoLegado?: string | null;
  disabled?: boolean;
};

function unirPorId(...listas: TEntityContact[][]): TEntityContact[] {
  const porId = new Map<string, TEntityContact>();
  listas.flat().forEach((contact) => porId.set(contact.id, contact));
  return [...porId.values()];
}

/**
 * Escolhe quem recebeu o técnico. Substitui o antigo campo de texto livre, mas
 * cadastra na hora: quem abre a porta na prefeitura raramente já está no
 * sistema.
 */
export const SeletorDeContatos = observer(function SeletorDeContatos(props: Props) {
  const { workspaceSlug, entityId, value, onChange, contatosConhecidos, textoLegado, disabled = false } = props;

  const { contacts, isLoading, refetch } = useEntityContactsOf(workspaceSlug, entityId);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  const disponiveis = useMemo(
    () => unirPorId(contatosConhecidos ?? [], contacts),
    [contatosConhecidos, contacts]
  );

  const selecionados = useMemo(
    () => value.map((id) => disponiveis.find((contact) => contact.id === id)).filter(Boolean) as TEntityContact[],
    [value, disponiveis]
  );

  const opcoes: ICustomSearchSelectOption[] = disponiveis.map((contact) => ({
    value: contact.id,
    query: `${contact.name} ${contact.email ?? ""} ${contact.phone ?? ""}`,
    content: (
      <div className="min-w-0">
        <p className="truncate">{contact.name}</p>
        {descricaoDoContato(contact) && (
          <p className="truncate text-11 text-secondary">{descricaoDoContato(contact)}</p>
        )}
      </div>
    ),
  }));

  const remover = (contactId: string) => onChange(value.filter((id) => id !== contactId));

  const aoCadastrar = (contact: TEntityContact) => {
    refetch();
    if (!value.includes(contact.id)) onChange([...value, contact.id]);
  };

  const rotuloBotao = () => {
    if (!entityId) return "Selecione a entidade primeiro";
    if (isLoading && disponiveis.length === 0) return "Carregando contatos...";
    if (selecionados.length === 0) return "Selecionar quem recebeu o técnico";
    if (selecionados.length === 1) return "1 responsável selecionado";
    return `${selecionados.length} responsáveis selecionados`;
  };

  return (
    <div className="space-y-2">
      <CustomSearchSelect
        multiple
        value={value}
        onChange={onChange}
        options={opcoes}
        disabled={disabled || !entityId}
        input
        className="w-full"
        buttonClassName="w-full bg-surface-2 text-13"
        optionsClassName="w-72"
        noResultsMessage="Nenhum contato encontrado nesta entidade."
        label={<span className="truncate text-left">{rotuloBotao()}</span>}
        footerOption={
          <button
            type="button"
            onClick={() => setCadastroAberto(true)}
            disabled={disabled}
            className="mx-2 mt-2 flex w-[calc(100%-1rem)] items-center gap-1.5 rounded-sm border-t border-subtle px-1 pt-2 text-11 text-accent-primary hover:bg-layer-transparent-hover disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Cadastrar contato
          </button>
        }
      />

      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selecionados.map((contact) => (
            <span
              key={contact.id}
              className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-11 text-primary"
            >
              <UserRound className="h-3 w-3 shrink-0 text-secondary" />
              <span className="max-w-40 truncate">{contact.name}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remover(contact.id)}
                  title={`Remover ${contact.name}`}
                  className="rounded p-px hover:bg-surface-3"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {textoLegado && (
        <p className="rounded border border-subtle bg-surface-2 px-3 py-2 text-11 text-secondary">
          <span className="font-medium text-secondary-text">Contatos registrados no sistema antigo: </span>
          {textoLegado}
        </p>
      )}

      <ContatoFormModal
        open={cadastroAberto}
        onClose={() => setCadastroAberto(false)}
        workspaceSlug={workspaceSlug}
        entityId={entityId ?? null}
        travarEntidade={!!entityId}
        onSaved={aoCadastrar}
      />
    </div>
  );
});
