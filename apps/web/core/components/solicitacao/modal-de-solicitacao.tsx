/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useRef, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import type { EditorRefApi } from "@plane/editor";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { RichTextEditor } from "@/components/editor/rich-text/editor";
import {
  buildPedidoDaSolicitacao,
  findPendenciaDaSolicitacao,
  readErroDoCampoDaSolicitacao,
  type ErroDoCampo,
  type FormularioDaSolicitacao,
  type PedidoDeSolicitacao,
} from "@/components/solicitacao/formulario-da-solicitacao";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useModulosDoSistema } from "@/hooks/use-chat-atendimento";
import { useEntities } from "@/hooks/use-entities";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type Props = {
  workspaceSlug: string;
  titulo: string;
  aviso?: string;
  rotuloDoEnvio: string;
  projetos: { value: string; label: string }[];
  inicial?: Partial<FormularioDaSolicitacao>;
  /** Campos recusados pela API (`errors: [{ path, message }]`). */
  erros?: ErroDoCampo[];
  enviando?: boolean;
  onConfirmar: (pedido: PedidoDeSolicitacao) => void;
  onCancelar: () => void;
};

const CAIXA =
  "w-full rounded-md border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none focus:border-accent-strong";

const ROTULO = "mb-1 block text-12 font-medium text-secondary";

/**
 * Sem chamado ainda não há onde guardar arquivo: imagem e anexo ficam de fora do
 * complemento. Na conversa, os arquivos vão anexados pelo servidor.
 */
const EXTENSOES_SEM_ARQUIVO = ["image", "attachment"] as const;

const recuseArquivo = async (): Promise<string> => {
  throw new Error("Anexe arquivos depois de abrir a solicitação.");
};

function ErroDoCampoDaTela({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <span className="mt-1 block text-11 text-danger-primary">{mensagem}</span>;
}

/**
 * O modal de abrir solicitação: o mesmo pela conversa do chat e pelo botão
 * "Nova solicitação" de quem só abre solicitação. Sistema, título, módulo,
 * entidade, complemento em texto rico e "cliente parado" (prioridade urgente).
 * Quem envia é quem abriu o modal (ver `useAcoesDaConversa` e
 * `useSolicitacaoAvulsa`).
 */
export const ModalDeSolicitacao = observer(function ModalDeSolicitacao(props: Props) {
  const {
    workspaceSlug,
    titulo,
    aviso,
    rotuloDoEnvio,
    projetos,
    inicial = {},
    erros = [],
    enviando = false,
    onConfirmar,
    onCancelar,
  } = props;
  const editorRef = useRef<EditorRefApi>(null);
  const [formulario, setFormulario] = useState<FormularioDaSolicitacao>({
    projectId: inicial.projectId ?? "",
    titulo: inicial.titulo ?? "",
    moduloId: "",
    entidadeId: inicial.entidadeId ?? "",
    complementoHtml: "<p></p>",
    clienteParado: false,
  });
  const { currentWorkspace } = useWorkspace();
  const { modulos } = useModulosDoSistema(workspaceSlug, formulario.projectId);
  const { entities } = useEntities(workspaceSlug);

  const change = (mudanca: Partial<FormularioDaSolicitacao>) => setFormulario((atual) => ({ ...atual, ...mudanca }));
  const pendencia = findPendenciaDaSolicitacao(formulario);
  const erroDe = (path: string) => readErroDoCampoDaSolicitacao(erros, path);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancelar}
      role="presentation"
    >
      <div
        className="shadow-xl max-h-full w-full max-w-lg overflow-y-auto rounded-xl border border-subtle bg-surface-1 p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => e.key === "Escape" && onCancelar()}
      >
        <h2 className="text-15 font-semibold text-primary">{titulo}</h2>
        {aviso && <p className="mt-1 text-12 text-secondary">{aviso}</p>}

        <div className="mt-4 space-y-4">
          <div>
            <p className={ROTULO}>Sistema</p>
            <SelectPesquisavel
              value={formulario.projectId}
              onChange={(projectId) => change({ projectId, moduloId: "" })}
              opcoes={projetos}
              placeholder="Selecione o sistema"
              searchPlaceholder="Buscar sistema"
            />
          </div>

          <div>
            <p className={ROTULO}>Título</p>
            <input
              value={formulario.titulo}
              onChange={(e) => change({ titulo: e.target.value })}
              maxLength={250}
              className={CAIXA}
            />
          </div>

          <div>
            <p className={ROTULO}>Módulo</p>
            <SelectPesquisavel
              value={formulario.moduloId}
              onChange={(moduloId) => change({ moduloId })}
              opcoes={modulos}
              opcaoVazia={{ value: "", label: "Nenhum" }}
              placeholder="Opcional"
              searchPlaceholder="Buscar módulo"
              disabled={!formulario.projectId}
            />
            <ErroDoCampoDaTela mensagem={erroDe("module_id")} />
          </div>

          <div>
            <p className={ROTULO}>Entidade</p>
            <SelectPesquisavel
              value={formulario.entidadeId}
              onChange={(entidadeId) => change({ entidadeId })}
              opcoes={(entities ?? []).map((e) => ({ value: e.id, label: e.name }))}
              opcaoVazia={{ value: "", label: "Sem entidade" }}
              searchPlaceholder="Buscar entidade"
            />
            <ErroDoCampoDaTela mensagem={erroDe("entity_id")} />
          </div>

          <div>
            <p className={ROTULO}>Complemento</p>
            <RichTextEditor
              editable
              id="complemento-da-solicitacao"
              ref={editorRef}
              initialValue="<p></p>"
              workspaceSlug={workspaceSlug}
              workspaceId={currentWorkspace?.id ?? ""}
              projectId={formulario.projectId || undefined}
              dragDropEnabled={false}
              disabledExtensions={[...EXTENSOES_SEM_ARQUIVO]}
              onChange={(_json: object, html: string) => change({ complementoHtml: html })}
              placeholder="Opcional"
              searchMentionCallback={async (payload) =>
                await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: formulario.projectId })
              }
              uploadFile={recuseArquivo}
              duplicateFile={recuseArquivo}
              containerClassName="min-h-[96px] rounded-md border border-subtle bg-surface-2"
            />
          </div>

          <label className="flex items-center gap-2 text-13 text-primary">
            <input
              type="checkbox"
              checked={formulario.clienteParado}
              onChange={(e) => change({ clienteParado: e.target.checked })}
            />
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
            onClick={() => onConfirmar(buildPedidoDaSolicitacao(formulario))}
            disabled={Boolean(pendencia) || enviando}
            title={pendencia ?? rotuloDoEnvio}
            className="rounded-md bg-accent-primary px-3 py-1.5 text-13 text-on-color disabled:cursor-not-allowed disabled:opacity-50"
          >
            {enviando ? "Enviando…" : rotuloDoEnvio}
          </button>
        </div>
      </div>
    </div>
  );
});
