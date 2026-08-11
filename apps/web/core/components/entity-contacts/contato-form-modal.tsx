/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TEntityContact } from "@plane/types";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
// hooks
import { useEntities } from "@/hooks/use-entities";
import { useEntityContactTypes } from "@/hooks/use-entity-contacts";
// services
import entityContactService, { type TEntityContactPayload } from "@/services/entity-contact.service";
// local imports
import { mensagemDeErro, paraCampoDeData } from "./helpers";

type TFormulario = {
  name: string;
  entity_id: string;
  type_id: string;
  email: string;
  phone: string;
  birth_date: string;
  notes: string;
  is_active: boolean;
  receive_messages: boolean;
};

const FORMULARIO_VAZIO: TFormulario = {
  name: "",
  entity_id: "",
  type_id: "",
  email: "",
  phone: "",
  birth_date: "",
  notes: "",
  is_active: true,
  receive_messages: true,
};

function paraFormulario(contact: TEntityContact | null | undefined, entidadePadrao: string): TFormulario {
  if (!contact) return { ...FORMULARIO_VAZIO, entity_id: entidadePadrao };
  return {
    name: contact.name ?? "",
    entity_id: contact.entity_id ?? entidadePadrao,
    type_id: contact.type_id ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    birth_date: paraCampoDeData(contact.birth_date),
    notes: contact.notes ?? "",
    is_active: contact.is_active ?? true,
    receive_messages: contact.receive_messages ?? true,
  };
}

/** `phone_digits` é derivado no servidor — o cliente nunca o envia. */
function paraPayload(form: TFormulario): TEntityContactPayload {
  return {
    name: form.name.trim(),
    entity_id: form.entity_id || null,
    type_id: form.type_id || null,
    email: form.email.trim() || null,
    phone: form.phone.trim() || null,
    birth_date: form.birth_date || null,
    notes: form.notes.trim() || null,
    is_active: form.is_active,
    receive_messages: form.receive_messages,
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  /** Ausente cria; presente edita. */
  contact?: TEntityContact | null;
  /** Entidade pré-selecionada — trava o campo quando o modal nasce dentro dela. */
  entityId?: string | null;
  travarEntidade?: boolean;
  /** Nome já digitado em outra tela (busca do seletor da visita). */
  nomeInicial?: string;
  /**
   * Telefone já conhecido (o número do WhatsApp de quem está no atendimento).
   * Sem ele o contato nasce sem telefone e a próxima conversa do mesmo número
   * volta a não identificar ninguém.
   */
  telefoneInicial?: string;
  onSaved: (contact: TEntityContact) => void;
};

const campoTexto =
  "w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-sm text-primary outline-none focus:border-accent-primary";
const rotulo = "mb-1 block text-xs font-medium text-secondary-text";

export const ContatoFormModal = observer(function ContatoFormModal(props: Props) {
  const {
    open,
    onClose,
    workspaceSlug,
    contact,
    entityId,
    travarEntidade = false,
    nomeInicial,
    telefoneInicial,
    onSaved,
  } = props;

  const { entities } = useEntities(workspaceSlug);
  const { types } = useEntityContactTypes(workspaceSlug);

  const [form, setForm] = useState<TFormulario>(() => paraFormulario(contact, entityId ?? ""));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    const inicial = paraFormulario(contact, entityId ?? "");
    // Ao EDITAR, o cadastro manda; os valores sugeridos só preenchem o que
    // estaria em branco num cadastro novo.
    if (contact) return setForm(inicial);
    setForm({
      ...inicial,
      name: nomeInicial || inicial.name,
      phone: telefoneInicial || inicial.phone,
    });
  }, [open, contact, entityId, nomeInicial, telefoneInicial]);

  const alterar = <K extends keyof TFormulario>(campo: K, valor: TFormulario[K]) =>
    setForm((atual) => ({ ...atual, [campo]: valor }));

  const salvar = async () => {
    if (!form.name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "O nome é obrigatório." });
      return;
    }
    setSalvando(true);
    try {
      const payload = paraPayload(form);
      const salvo = contact
        ? await entityContactService.update(workspaceSlug, contact.id, payload)
        : await entityContactService.create(workspaceSlug, payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: contact ? "Salvo" : "Cadastrado",
        message: contact ? "Contato atualizado." : "Contato cadastrado.",
      });
      onSaved(salvo);
      onClose();
    } catch (erro) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: mensagemDeErro(erro, "Falha ao salvar o contato."),
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(aberto) => {
        if (!aberto) onClose();
      }}
    >
      <Dialog.Panel width={EDialogWidth.LG}>
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title>{contact ? "Editar contato" : "Novo contato"}</Dialog.Title>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-secondary-text transition-colors hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className={rotulo}>Nome *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => alterar("name", e.target.value)}
                className={campoTexto}
                placeholder="Nome completo"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>Entidade</label>
                <SelectPesquisavel
                  value={form.entity_id}
                  onChange={(valor) => alterar("entity_id", valor)}
                  opcoes={(entities ?? []).map((entidade) => ({
                    value: entidade.id,
                    label: entidade.name,
                    descricao: [entidade.city, entidade.state].filter(Boolean).join("/"),
                  }))}
                  opcaoVazia={{ value: "", label: "Sem entidade" }}
                  disabled={travarEntidade}
                />
              </div>
              <div>
                <label className={rotulo}>Tipo</label>
                <SelectPesquisavel
                  value={form.type_id}
                  onChange={(valor) => alterar("type_id", valor)}
                  opcoes={types.map((tipo) => ({ value: tipo.id, label: tipo.name }))}
                  opcaoVazia={{ value: "", label: "Sem tipo" }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={rotulo}>E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => alterar("email", e.target.value)}
                  className={campoTexto}
                  placeholder="fulano@prefeitura.gov.br"
                />
              </div>
              <div>
                <label className={rotulo}>Telefone</label>
                <input
                  value={form.phone}
                  onChange={(e) => alterar("phone", e.target.value)}
                  className={campoTexto}
                  placeholder="(67) 99999-0000"
                />
              </div>
            </div>

            <div>
              <label className={rotulo}>Data de nascimento</label>
              <input
                type="date"
                value={form.birth_date}
                onChange={(e) => alterar("birth_date", e.target.value)}
                className={campoTexto}
              />
            </div>

            <div>
              <label className={rotulo}>Observações</label>
              <textarea
                value={form.notes}
                onChange={(e) => alterar("notes", e.target.value)}
                rows={3}
                className={campoTexto}
                placeholder="Horário de atendimento, ramal, preferências de contato..."
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-primary">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => alterar("is_active", e.target.checked)}
                  className="h-4 w-4 rounded accent-accent-primary"
                />
                Ativo
              </label>
              <label className="flex items-center gap-2 text-sm text-primary">
                <input
                  type="checkbox"
                  checked={form.receive_messages}
                  onChange={(e) => alterar("receive_messages", e.target.checked)}
                  className="h-4 w-4 rounded accent-accent-primary"
                />
                Recebe mensagens
              </label>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" onClick={salvar} loading={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
});
