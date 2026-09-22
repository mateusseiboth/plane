/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntityContactType } from "@plane/types";
// hooks
import { useEntityContactTypes } from "@/hooks/use-entity-contacts";
// services
import entityContactService from "@/services/entity-contact.service";
// local imports
import { mensagemDeErro } from "./helpers";

type Props = { open: boolean; onClose: () => void; workspaceSlug: string };

const INPUT_CLASS =
  "w-full rounded border border-subtle bg-surface-2 px-3 py-1.5 text-13 text-primary outline-none focus:border-accent-primary";

function LinhaDoTipo(props: {
  tipo: TEntityContactType;
  onSave: (id: string, data: Partial<TEntityContactType>) => Promise<void>;
  onRemove: (tipo: TEntityContactType) => Promise<void>;
}) {
  const { tipo, onSave, onRemove } = props;
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(tipo.name);

  const salvarNome = async () => {
    await onSave(tipo.id, { name: nome.trim() });
    setEditando(false);
  };

  return (
    <li className="flex items-center gap-2 px-3 py-2 text-13">
      {editando ? (
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className={INPUT_CLASS}
          aria-label="Nome do tipo"
        />
      ) : (
        <span className={`flex-1 ${tipo.is_active ? "text-primary" : "text-placeholder line-through"}`}>
          {tipo.name}
        </span>
      )}
      <label className="flex items-center gap-1 text-12 text-secondary" title="Contato deste tipo usa o sistema">
        <input
          type="checkbox"
          checked={Boolean(tipo.is_system_user)}
          onChange={(e) => onSave(tipo.id, { is_system_user: e.target.checked })}
          className="accent-accent-primary h-3.5 w-3.5"
        />
        Usuário do sistema
      </label>
      <label className="flex items-center gap-1 text-12 text-secondary">
        <input
          type="checkbox"
          checked={tipo.is_active !== false}
          onChange={(e) => onSave(tipo.id, { is_active: e.target.checked })}
          className="accent-accent-primary h-3.5 w-3.5"
        />
        Ativo
      </label>
      {editando ? (
        <button type="button" onClick={salvarNome} title="Salvar" className="hover:bg-surface-3 rounded p-1">
          <Check className="h-3.5 w-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          title="Renomear"
          className="hover:bg-surface-3 rounded p-1"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(tipo)}
        title="Excluir"
        className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 rounded p-1 text-secondary"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/** Cadastro dos tipos de responsável (Prefeito, Secretário, Técnico de TI...). */
export function TiposDeResponsavelModal({ open, onClose, workspaceSlug }: Props) {
  const { types, refetch } = useEntityContactTypes(open ? workspaceSlug : undefined);
  const [novo, setNovo] = useState("");
  const [erroNovo, setErroNovo] = useState<string | null>(null);

  const showError = (erro: unknown) =>
    setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: mensagemDeErro(erro, "Não foi possível salvar.") });

  const onCreate = async () => {
    if (!novo.trim()) {
      setErroNovo("Informe o nome.");
      return;
    }
    try {
      await entityContactService.createType(workspaceSlug, { name: novo.trim() });
      setNovo("");
      setErroNovo(null);
      await refetch();
    } catch (erro) {
      setErroNovo(mensagemDeErro(erro, "Não foi possível criar o tipo."));
    }
  };

  const onSave = async (id: string, data: Partial<TEntityContactType>) => {
    try {
      await entityContactService.updateType(workspaceSlug, id, data);
      await refetch();
    } catch (erro) {
      showError(erro);
    }
  };

  const onRemove = async (tipo: TEntityContactType) => {
    if (!window.confirm(`Excluir o tipo "${tipo.name}"? Os contatos deste tipo ficam sem tipo.`)) return;
    try {
      await entityContactService.destroyType(workspaceSlug, tipo.id);
      await refetch();
    } catch (erro) {
      showError(erro);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Panel width={EDialogWidth.XL}>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <Dialog.Title>Tipos de responsável</Dialog.Title>
            <button type="button" onClick={onClose} className="rounded p-1 text-secondary hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <div className="flex gap-2">
              <input
                value={novo}
                onChange={(e) => {
                  setNovo(e.target.value);
                  setErroNovo(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
                className={INPUT_CLASS}
                placeholder="Novo tipo, por exemplo: Secretário de Finanças"
                aria-label="Nome do novo tipo"
              />
              <Button variant="primary" size="lg" onClick={onCreate}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
            {erroNovo && <p className="mt-1 text-12 text-danger-primary">{erroNovo}</p>}
          </div>

          <ul className="max-h-96 divide-y divide-subtle overflow-y-auto rounded border border-subtle">
            {types.length === 0 && (
              <li className="px-3 py-4 text-center text-13 text-secondary">Nenhum tipo cadastrado.</li>
            )}
            {types.map((tipo) => (
              <LinhaDoTipo key={tipo.id} tipo={tipo} onSave={onSave} onRemove={onRemove} />
            ))}
          </ul>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
