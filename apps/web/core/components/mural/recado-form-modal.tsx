/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EFileAssetType } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { RichTextEditor } from "@/components/editor/rich-text/editor";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useMuralActions } from "@/hooks/use-mural";
// services
import { FileService } from "@/services/file.service";
import type { TMuralRecado } from "@/services/mural.service";
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import { buildRecadoPayload, editorInicial, getFieldErrors, toRecadoForm, type TRecadoForm } from "./helpers";

const fileService = new FileService();
const workspaceService = new WorkspaceService();

// O tipo de arquivo não tem um valor próprio do mural (e `EFileAssetType` é
// herdado do Plane): imagem colada no texto entra como a de página do espaço, e o
// anexo como arquivo do espaço, que é o que a API guarda sem projeto.
const TIPO_DA_IMAGEM = EFileAssetType.PAGE_DESCRIPTION;
const TIPO_DO_ANEXO = EFileAssetType.WORKSPACE_LOGO;

type Props = {
  workspaceSlug: string;
  open: boolean;
  /** Ausente cria; presente edita. */
  recado?: TMuralRecado | null;
  onClose: () => void;
};

const campoTexto =
  "w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-primary";
const rotulo = "mb-1 block text-12 font-medium text-secondary";

function ErroDoCampo({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <p className="mt-1 text-11 text-danger-primary">{mensagem}</p>;
}

type FormProps = Omit<Props, "open">;

/**
 * Corpo do formulário. Monta uma vez por abertura (o modal só o renderiza com
 * `open`), então o estado e o editor rico nascem do MESMO recado.
 *
 * Semear o estado por efeito depois da montagem publicava recado vazio: o
 * editor continuava com o texto da abertura anterior (mesma `key`, sem
 * remontar) enquanto o estado já tinha voltado ao vazio, e a API recusava
 * "Escreva o recado." com o texto à vista de quem publicava.
 */
const RecadoForm = observer(function RecadoForm(props: FormProps) {
  const { workspaceSlug, recado, onClose } = props;
  const { create, update } = useMuralActions(workspaceSlug);
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";

  const [form, setForm] = useState<TRecadoForm>(() => toRecadoForm(recado));
  const [erros, setErros] = useState<Record<string, string>>({});
  const [isSalvando, setIsSalvando] = useState(false);
  const [isEnviandoAnexo, setIsEnviandoAnexo] = useState(false);

  const setCampo = <K extends keyof TRecadoForm>(campo: K, valor: TRecadoForm[K]) =>
    setForm((atual) => ({ ...atual, [campo]: valor }));

  const uploadAnexo = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setIsEnviandoAnexo(true);
    try {
      const { asset_id } = await fileService.uploadWorkspaceAsset(
        workspaceSlug,
        { entity_identifier: "", entity_type: TIPO_DO_ANEXO },
        arquivo
      );
      setForm((atual) => ({ ...atual, attachment_id: asset_id, attachment_name: arquivo.name }));
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível anexar o arquivo. Tente de novo." });
    } finally {
      setIsEnviandoAnexo(false);
    }
  };

  const save = async () => {
    setIsSalvando(true);
    setErros({});
    try {
      const payload = buildRecadoPayload(form);
      await (recado ? update(recado.id, payload) : create(payload));
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: recado ? "Recado salvo" : "Recado publicado",
        message: payload.title ?? "",
      });
      onClose();
    } catch (erro) {
      setErros(getFieldErrors(erro));
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Revise os campos do recado." });
    } finally {
      setIsSalvando(false);
    }
  };

  return (
    <div className="max-h-[90vh] space-y-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <Dialog.Title>{recado ? "Editar recado" : "Novo recado"}</Dialog.Title>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="rounded p-1 text-secondary transition-colors hover:bg-surface-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div>
        <label className={rotulo} htmlFor="mural-titulo">
          Título *
        </label>
        <input
          id="mural-titulo"
          maxLength={200}
          value={form.title}
          onChange={(e) => setCampo("title", e.target.value)}
          className={campoTexto}
        />
        <ErroDoCampo mensagem={erros.title} />
      </div>

      <div>
        <span className={rotulo}>Recado *</span>
        <div
          className={cn("min-h-[160px] rounded border border-subtle bg-surface-1 py-2", {
            "border-danger-strong": !!erros.description_html,
          })}
        >
          {workspaceId && (
            <RichTextEditor
              editable
              id={`mural-form-${recado?.id ?? "novo"}`}
              initialValue={editorInicial(form)}
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              dragDropEnabled={false}
              onChange={(_json: object, html: string) => setCampo("description_html", html)}
              searchMentionCallback={(payload) => workspaceService.searchEntity(workspaceSlug, payload)}
              uploadFile={async (blockId, file) => {
                const { asset_id } = await uploadEditorAsset({
                  blockId,
                  data: { entity_identifier: recado?.id ?? "", entity_type: TIPO_DA_IMAGEM },
                  file,
                  workspaceSlug,
                });
                return asset_id;
              }}
              duplicateFile={async (assetId: string) => {
                const { asset_id } = await duplicateEditorAsset({
                  assetId,
                  entityType: TIPO_DA_IMAGEM,
                  workspaceSlug,
                });
                return asset_id;
              }}
            />
          )}
        </div>
        <ErroDoCampo mensagem={erros.description_html} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="mural-validade">
            Válido até
          </label>
          <input
            id="mural-validade"
            type="date"
            value={form.expires_at}
            onChange={(e) => setCampo("expires_at", e.target.value)}
            className={campoTexto}
          />
          <ErroDoCampo mensagem={erros.expires_at} />
        </div>
        <div>
          <span className={rotulo}>Anexo</span>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-subtle px-2 py-1.5 text-12 hover:bg-surface-2">
              <Paperclip className="h-3.5 w-3.5" />
              {isEnviandoAnexo ? "Enviando..." : "Escolher arquivo"}
              <input
                type="file"
                className="hidden"
                disabled={isEnviandoAnexo}
                onChange={(e) => void uploadAnexo(e.target.files?.[0])}
              />
            </label>
            {form.attachment_id && (
              <span className="flex min-w-0 items-center gap-1 text-12">
                <span className="truncate">{form.attachment_name || "Arquivo anexado"}</span>
                <button
                  type="button"
                  aria-label="Remover anexo"
                  onClick={() => setForm((atual) => ({ ...atual, attachment_id: "", attachment_name: "" }))}
                  className="rounded p-0.5 text-secondary hover:bg-surface-2"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
          <ErroDoCampo mensagem={erros.attachment_id} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-6">
        <label className="flex items-center gap-2 text-13 text-primary">
          <input type="checkbox" checked={form.is_pinned} onChange={(e) => setCampo("is_pinned", e.target.checked)} />
          Fixar no topo
        </label>
        <label className="flex items-center gap-2 text-13 text-primary">
          <input
            type="checkbox"
            checked={form.is_required}
            onChange={(e) => setCampo("is_required", e.target.checked)}
          />
          Leitura obrigatória
        </label>
      </div>
      {form.is_required && (
        <p className="text-11 text-tertiary">Abre para cada pessoa ao entrar, até ela confirmar a leitura.</p>
      )}

      <div className="flex justify-end gap-2 border-t border-subtle pt-4">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" size="sm" onClick={save} loading={isSalvando} disabled={isEnviandoAnexo}>
          {recado ? "Salvar" : "Publicar"}
        </Button>
      </div>
    </div>
  );
});

export const MuralRecadoFormModal = observer(function MuralRecadoFormModal(props: Props) {
  const { workspaceSlug, open, recado, onClose } = props;
  return (
    <Dialog open={open} onOpenChange={(aberto) => !aberto && onClose()}>
      <Dialog.Panel width={EDialogWidth.XXXL}>
        {open && (
          <RecadoForm key={recado?.id ?? "novo"} workspaceSlug={workspaceSlug} recado={recado} onClose={onClose} />
        )}
      </Dialog.Panel>
    </Dialog>
  );
});
