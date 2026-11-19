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
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// components
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { RichTextEditor } from "@/components/editor/rich-text/editor";
import { BlocoDaWiki } from "@/components/solicitacao/bloco-da-wiki";
import { buildImagensDaSolicitacao } from "@/components/solicitacao/imagens-da-solicitacao";
import type { ConfirmacaoDaSolicitacao } from "@/components/solicitacao/confirmacao-da-solicitacao";
import { ORIENTACAO_DA_ABERTURA } from "@/components/solicitacao/orientacao-da-abertura";
import { buildTextoDaBuscaNaWiki } from "@/components/solicitacao/sugestoes-da-wiki";
import {
  buildPedidoDaSolicitacao,
  findPendenciaDaSolicitacao,
  readErroDoCampoDaSolicitacao,
  type ErroDoCampo,
  type FormularioDaSolicitacao,
  type PedidoDeSolicitacao,
} from "@/components/solicitacao/formulario-da-solicitacao";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
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
  /** Na avulsa a descrição é obrigatória; pela conversa ela é a transcrição. */
  isDescricaoObrigatoria?: boolean;
  /** Depois de aberta: o modal mostra o número para o atendimento copiar. */
  confirmacao?: ConfirmacaoDaSolicitacao | null;
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
/** Anexo de arquivo fica para o chamado; imagem colada entra pelo editor. */
const EXTENSOES_SEM_ARQUIVO = ["attachment"] as const;

function ErroDoCampoDaTela({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return <span className="mt-1 block text-11 text-danger-primary">{mensagem}</span>;
}

const copyNumero = async (numero: string) => {
  await copyTextToClipboard(numero);
  setToast({ type: TOAST_TYPE.SUCCESS, title: "Número copiado", message: numero });
};

/** A solicitação aberta: o número grande, para copiar e passar ao cliente. */
function ConfirmacaoDaAbertura(props: {
  confirmacao: ConfirmacaoDaSolicitacao;
  isClienteParado: boolean;
  onFechar: () => void;
}) {
  const { confirmacao, isClienteParado, onFechar } = props;
  return (
    <div className="space-y-4 p-5">
      <h2 className="text-15 font-semibold text-primary">Solicitação aberta</h2>
      <div className="rounded-md border border-subtle bg-surface-2 p-4">
        <p className="text-12 text-secondary">Número para o cliente</p>
        <div className="mt-1 flex items-center gap-3">
          <span className="font-mono text-24 font-semibold text-primary select-all">
            {confirmacao.numeroParaOCliente}
          </span>
          <button
            type="button"
            onClick={() => void copyNumero(confirmacao.numeroParaOCliente)}
            className="rounded-md border border-subtle px-2.5 py-1 text-12 text-secondary hover:bg-layer-1"
          >
            Copiar
          </button>
        </div>
        {confirmacao.numeroNoSistema && (
          <p className="mt-2 text-12 text-tertiary">No sistema: {confirmacao.numeroNoSistema}</p>
        )}
      </div>
      <p className={isClienteParado ? "text-13 font-medium text-danger-primary" : "text-13 text-secondary"}>
        {confirmacao.aviso}
      </p>
      <div className="flex justify-end">
        <button onClick={onFechar} className="rounded-md bg-accent-primary px-3 py-1.5 text-13 text-on-color">
          Fechar
        </button>
      </div>
    </div>
  );
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
    isDescricaoObrigatoria = true,
    confirmacao = null,
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
    assetIds: [],
  });
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();

  // O editor guarda as funções da primeira renderização: o sistema vem do ref,
  // sempre o atual (ver imagens-da-solicitacao).
  const sistemaAtual = useRef(formulario.projectId);
  sistemaAtual.current = formulario.projectId;
  const { uploadImagem, duplicateImagem } = buildImagensDaSolicitacao({
    workspaceSlug,
    readProjectId: () => sistemaAtual.current,
    upload: uploadEditorAsset,
    duplicate: duplicateEditorAsset,
    keepAsset: (assetId) => setFormulario((atual) => ({ ...atual, assetIds: [...atual.assetIds, assetId] })),
    onSemSistema: (mensagem) => setToast({ type: TOAST_TYPE.WARNING, title: mensagem }),
  });
  const { currentWorkspace } = useWorkspace();
  const { modulos } = useModulosDoSistema(workspaceSlug, formulario.projectId);
  const { entities } = useEntities(workspaceSlug);

  const change = (mudanca: Partial<FormularioDaSolicitacao>) => setFormulario((atual) => ({ ...atual, ...mudanca }));
  const pendencia = findPendenciaDaSolicitacao(formulario, { isDescricaoObrigatoria });
  const erroDe = (path: string) => readErroDoCampoDaSolicitacao(erros, path);

  return (
    // ModalCore abre num portal, fora da barra lateral: um `fixed` montado
    // dentro dela ficava preso ao painel, encolhido embaixo do botão.
    <ModalCore isOpen handleClose={onCancelar} position={EModalPosition.CENTER} width={EModalWidth.LG}>
      {confirmacao ? (
        <ConfirmacaoDaAbertura
          confirmacao={confirmacao}
          isClienteParado={formulario.clienteParado}
          onFechar={onCancelar}
        />
      ) : (
        <div className="p-5" onKeyDown={(e) => e.key === "Escape" && onCancelar()}>
          <h2 className="text-15 font-semibold text-primary">{titulo}</h2>
          {aviso && <p className="mt-1 text-12 text-secondary">{aviso}</p>}
          <p className="mt-2 rounded-md bg-layer-1 px-3 py-2 text-12 text-secondary">{ORIENTACAO_DA_ABERTURA}</p>

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
              {/* O "caminho do menu" do legado: em que parte do sistema o problema acontece. */}
              <p className={ROTULO}>Módulo (menu do sistema onde acontece)</p>
              <SelectPesquisavel
                value={formulario.moduloId}
                onChange={(moduloId) => change({ moduloId })}
                opcoes={modulos}
                opcaoVazia={{ value: "", label: "Nenhum" }}
                placeholder="Escolha o menu"
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
                placeholder="Selecione a entidade"
                searchPlaceholder="Buscar entidade"
              />
              <ErroDoCampoDaTela mensagem={erroDe("entity_id")} />
            </div>

            <div>
              <p className={ROTULO}>{isDescricaoObrigatoria ? "Descrição do problema" : "Complemento"}</p>
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
                placeholder={isDescricaoObrigatoria ? "O que o cliente fez e a mensagem de erro" : "Opcional"}
                searchMentionCallback={async (payload) =>
                  await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: formulario.projectId })
                }
                uploadFile={uploadImagem}
                duplicateFile={duplicateImagem}
                containerClassName="min-h-[96px] rounded-md border border-subtle bg-surface-2"
              />
              <ErroDoCampoDaTela mensagem={erroDe("description_html")} />
            </div>

            <BlocoDaWiki
              workspaceSlug={workspaceSlug}
              texto={buildTextoDaBuscaNaWiki(formulario.titulo, formulario.complementoHtml)}
              projectId={formulario.projectId || undefined}
            />

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
      )}
    </ModalCore>
  );
});
