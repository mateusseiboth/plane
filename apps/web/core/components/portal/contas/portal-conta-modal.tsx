/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { SeletorDeSistemas } from "@/components/entity-contacts/seletor-de-sistemas";
// helpers
import { applyApiFieldErrors } from "@/helpers/api-field-errors.helper";
// hooks
import { useEntities } from "@/hooks/use-entities";
// services
import portalContasService from "@/services/portal-contas.service";
// local imports
import { buildContaForm, buildContaPayload, type TPortalConta, type TPortalContaForm } from "./portal-conta-rules";

type TErros = Partial<Record<keyof TPortalContaForm, string>>;

type TCampoDeTexto = { campo: "name" | "email" | "password"; rotulo: string; tipo?: string; placeholder?: string };

const CAMPOS_DE_TEXTO: TCampoDeTexto[] = [
  { campo: "name", rotulo: "Nome", placeholder: "Nome de quem vai usar o portal" },
  { campo: "email", rotulo: "E-mail", tipo: "email", placeholder: "contato@prefeitura.gov.br" },
  { campo: "password", rotulo: "Senha", tipo: "password" },
];

type Props = {
  workspaceSlug: string;
  conta: TPortalConta | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/** Criar e editar a conta do portal: dados, entidade e sistemas liberados. */
export const PortalContaModal = observer(function PortalContaModal(props: Props) {
  const { workspaceSlug, conta, open, onClose, onSaved } = props;
  const criando = !conta;
  const [form, setForm] = useState<TPortalContaForm>(buildContaForm(conta));
  const [erros, setErros] = useState<TErros>({});
  const [salvando, setSalvando] = useState(false);
  const { entities } = useEntities(workspaceSlug);

  useEffect(() => {
    setForm(buildContaForm(conta));
    setErros({});
  }, [conta, open]);

  const opcoesDeEntidade = useMemo(
    () => (entities ?? []).map((e) => ({ value: e.id, label: e.name, descricao: e.city ?? undefined })),
    [entities]
  );

  const update = <K extends keyof TPortalContaForm>(campo: K, valor: TPortalContaForm[K]) => {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => ({ ...atual, [campo]: undefined }));
  };

  const save = async () => {
    setSalvando(true);
    try {
      const payload = buildContaPayload(form, criando);
      await (conta
        ? portalContasService.update(workspaceSlug, conta.id, payload)
        : portalContasService.create(workspaceSlug, payload));
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Salvo", message: criando ? "Conta criada." : "Conta atualizada." });
      onSaved();
      onClose();
    } catch (error) {
      const novos: TErros = {};
      const message = applyApiFieldErrors(
        error,
        (path, texto) => {
          novos[path as keyof TPortalContaForm] = texto;
        },
        "Não foi possível salvar a conta."
      );
      setErros(novos);
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(valor) => !valor && onClose()}>
      <Dialog.Panel width={EDialogWidth.XL}>
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title>{criando ? "Nova conta do portal" : "Editar conta do portal"}</Dialog.Title>
            <button type="button" onClick={onClose} className="rounded p-1 text-secondary hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            {CAMPOS_DE_TEXTO.map(({ campo, rotulo, tipo, placeholder }) => (
              <div key={campo}>
                <label htmlFor={`portal-${campo}`} className="mb-1 block text-12 font-medium text-secondary">
                  {rotulo}
                </label>
                <Input
                  id={`portal-${campo}`}
                  type={tipo ?? "text"}
                  value={form[campo]}
                  onChange={(e) => update(campo, e.target.value)}
                  hasError={Boolean(erros[campo])}
                  placeholder={campo === "password" && !criando ? "Em branco mantém a senha atual" : placeholder}
                  className="w-full"
                />
                {erros[campo] && <p className="mt-1 text-12 text-danger-primary">{erros[campo]}</p>}
              </div>
            ))}

            <div>
              <span className="mb-1 block text-12 font-medium text-secondary">Entidade</span>
              <SelectPesquisavel
                value={form.entity_id}
                onChange={(valor) => update("entity_id", valor)}
                opcoes={opcoesDeEntidade}
                opcaoVazia={{ value: null, label: "Nenhuma" }}
              />
              {erros.entity_id && <p className="mt-1 text-12 text-danger-primary">{erros.entity_id}</p>}
              <p className="mt-1 text-11 text-tertiary">A entidade libera as visitas técnicas dela no portal.</p>
            </div>

            <div>
              <span className="mb-1 block text-12 font-medium text-secondary">Sistemas liberados</span>
              <SeletorDeSistemas
                value={form.project_ids}
                onChange={(ids) => update("project_ids", ids)}
                error={erros.project_ids}
              />
            </div>

            <label className="flex items-center gap-2 text-13 text-primary">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => update("is_active", e.target.checked)}
                className="accent-accent-primary h-4 w-4 rounded"
              />
              Ativa
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" onClick={save} loading={salvando}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
});
