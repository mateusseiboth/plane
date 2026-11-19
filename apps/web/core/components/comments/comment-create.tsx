/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { Loader } from "lucide-react";
import { observer } from "mobx-react";
import { useForm, Controller } from "react-hook-form";
// plane imports
import { EIssueCommentAccessSpecifier } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import type { TIssueComment, TCommentsOperations } from "@plane/types";
import { cn, isCommentEmpty } from "@plane/utils";
// components
import { LiteTextEditor } from "@/components/editor/lite-text";
import { AiImproveButton } from "@/components/editor/ai-improve-button";
import {
  BotaoComentarEMovimentar,
  type TMovimentacaoDoComentario,
} from "@/components/comments/movimentacao/botao-comentar-e-movimentar";
import { sendComentarioEMovimentacao } from "@/components/comments/movimentacao/comentar-e-movimentar";
import { IndicadorDeConsulta, ItensFaltantes, PainelDeAnalise, textoDoEditor } from "@/components/ia";
// helpers
import { colarTrechoNoEditor } from "@/helpers/colar-trecho.helper";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useAnaliseDeChamado } from "@/hooks/use-analise-de-chamado";
import { useContextoDeRequisito } from "@/hooks/use-contexto-de-requisito";
import { useTextoFantasmaCampo } from "@/hooks/use-texto-fantasma-campo";
import { useTextoFantasmaEditor } from "@/hooks/use-texto-fantasma-editor";
import { useTipoDeRequisito } from "@/hooks/use-tipo-de-requisito";
// services
import { FileService } from "@/services/file.service";
// store
import { comentariosEmProcessamento } from "@/store/issue/issue-details/comentarios-em-processamento";

type TCommentCreate = {
  entityId: string;
  workspaceSlug: string;
  activityOperations: TCommentsOperations;
  showToolbarInitially?: boolean;
  projectId?: string;
  onSubmitCallback?: (elementId: string) => void;
  /** Liga o "Comentar e movimentar" (só no chamado, fora da triagem). */
  movimentacao?: TMovimentacaoDoComentario;
};

// services
const fileService = new FileService();

export const CommentCreate = observer(function CommentCreate(props: TCommentCreate) {
  const {
    workspaceSlug,
    entityId,
    activityOperations,
    showToolbarInitially = false,
    projectId,
    onSubmitCallback,
    movimentacao,
  } = props;
  // states
  const [uploadedAssetIds, setUploadedAssetIds] = useState<string[]>([]);
  // refs
  const editorRef = useRef<EditorRefApi>(null);
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const workspaceStore = useWorkspace();
  // derived values
  const workspaceId = workspaceStore.getWorkspaceBySlug(workspaceSlug)?.id as string;
  // form info
  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting },
    reset,
  } = useForm<Partial<TIssueComment>>({
    defaultValues: {
      comment_html: "<p></p>",
    },
  });

  const commentHTML = watch("comment_html");
  const isEmpty = isCommentEmpty(commentHTML ?? undefined);
  // texto fantasma da IA de requisitos
  const chamado = getIssueById(entityId);
  const tipo = useTipoDeRequisito(chamado?.label_ids);
  const { projeto } = useContextoDeRequisito({ workspaceSlug, projectId });
  const comentarioEmTexto = textoDoEditor(commentHTML);
  const contextoDoChamado = {
    projeto,
    titulo: chamado?.name,
    descricao: textoDoEditor(chamado?.description_html),
  };
  const { sugestao, faltando, consultando, propsDeFoco } = useTextoFantasmaCampo({
    workspaceSlug,
    campo: "comentario",
    texto: comentarioEmTexto,
    projectId,
    issueId: entityId,
    tipo,
    contexto: contextoDoChamado,
  });
  const { extensoes } = useTextoFantasmaEditor(sugestao);
  // análise ao enviar — só roda quando `analise_em_comentarios` estiver ligada
  const analise = useAnaliseDeChamado({
    workspaceSlug,
    campo: "comentario",
    projectId,
    issueId: entityId,
    tipo,
    conteudo: { comentario: comentarioEmTexto },
    contexto: contextoDoChamado,
  });

  const clearEditor = () => {
    reset({ comment_html: "<p></p>" });
    editorRef.current?.clearEditor();
    analise.descartar();
  };

  /** `true` = o comentário foi gravado. Falha ou painel da IA mantêm o texto no editor. */
  const saveComentario = async (formData: Partial<TIssueComment>): Promise<boolean> => {
    // `false` = o painel apareceu; o próximo envio segue (ou, no modo `exigir`,
    // reanalisa depois da correção). Falha ou resposta vazia nunca seguram.
    comentariosEmProcessamento.start(entityId);
    try {
      if (!(await analise.liberarSalvamento())) return false;
      const comment = await activityOperations.createComment(formData);
      // Gravou: limpa já, senão uma falha nos anexos deixaria o texto para reenviar em dobro.
      clearEditor();
      if (comment?.id) onSubmitCallback?.(comment.id);
      if (uploadedAssetIds.length > 0) {
        if (projectId) {
          await fileService.updateBulkProjectAssetsUploadStatus(workspaceSlug, projectId.toString(), entityId, {
            asset_ids: uploadedAssetIds,
          });
        } else {
          await fileService.updateBulkWorkspaceAssetsUploadStatus(workspaceSlug, entityId, {
            asset_ids: uploadedAssetIds,
          });
        }
        setUploadedAssetIds([]);
      }
      return true;
    } catch (error) {
      console.error(error);
      return false;
    } finally {
      comentariosEmProcessamento.end(entityId);
    }
  };

  const onSubmit = async (formData: Partial<TIssueComment>) => {
    await saveComentario(formData);
  };

  const onComentarEMovimentar = (stateId: string) =>
    handleSubmit(async (formData) => {
      if (!movimentacao) return;
      await sendComentarioEMovimentacao(
        { comentar: () => saveComentario(formData), mover: movimentacao.mover },
        stateId
      );
    })();

  // Fechar a aba no meio do envio perde o comentário: o navegador pergunta antes.
  useEffect(() => {
    if (!isSubmitting) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isSubmitting]);

  return (
    <div
      className={cn("sticky bottom-0 z-[4] bg-surface-1 sm:static")}
      {...propsDeFoco}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          !isEmpty &&
          !isSubmitting &&
          editorRef.current?.isEditorReadyToDiscard()
        )
          handleSubmit(onSubmit)(e);
      }}
    >
      <Controller
        name="access"
        control={control}
        render={({ field: { onChange: onAccessChange, value: accessValue } }) => (
          <Controller
            name="comment_html"
            control={control}
            render={({ field: { value, onChange } }) => (
              <LiteTextEditor
                editable
                workspaceId={workspaceId}
                id={"add_comment_" + entityId}
                value={"<p></p>"}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                onEnterKeyPress={(e) => {
                  if (!isEmpty && !isSubmitting) {
                    handleSubmit(onSubmit)(e);
                  }
                }}
                ref={editorRef}
                extensions={extensoes}
                initialValue={value ?? "<p></p>"}
                containerClassName="min-h-min"
                onChange={(comment_json, comment_html) => onChange(comment_html)}
                accessSpecifier={accessValue ?? EIssueCommentAccessSpecifier.INTERNAL}
                handleAccessChange={onAccessChange}
                isSubmitting={isSubmitting}
                uploadFile={async (blockId, file) => {
                  const { asset_id } = await activityOperations.uploadCommentAsset(blockId, file);
                  setUploadedAssetIds((prev) => [...prev, asset_id]);
                  return asset_id;
                }}
                duplicateFile={async (assetId: string) => {
                  const { asset_id } = await activityOperations.duplicateCommentAsset(assetId);
                  setUploadedAssetIds((prev) => [...prev, asset_id]);
                  return asset_id;
                }}
                showToolbarInitially={showToolbarInitially}
                parentClassName="p-2"
                displayConfig={{
                  fontSize: "small-font",
                }}
                submitActions={
                  movimentacao && (
                    <BotaoComentarEMovimentar
                      movimentacao={movimentacao}
                      disabled={isEmpty || isSubmitting}
                      onEscolherEtapa={(stateId) => void onComentarEMovimentar(stateId)}
                    />
                  )
                }
              />
            )}
          />
        )}
      />
      {analise.mostrarPainel && (
        <PainelDeAnalise
          analise={analise.analise}
          mostrarIndicador={analise.configuracao.mostrar_indicador}
          bloqueado={analise.bloqueado}
          minimoAceitacao={analise.configuracao.minimo_aceitacao}
          analisando={analise.analisando}
          aoReanalisar={analise.reanalisar}
          aoColar={colarTrechoNoEditor(editorRef)}
          rotuloColar="Colar no comentário"
          className="mx-2 mt-2"
        />
      )}
      {isSubmitting && (
        <p role="status" className="mx-2 mt-2 flex items-center gap-2 text-body-xs-medium text-accent-primary">
          <Loader className="size-4 shrink-0 animate-spin" />
          Processando o comentário. Aguarde antes de fechar.
        </p>
      )}
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <IndicadorDeConsulta consultando={consultando} className="mt-1" />
        <ItensFaltantes itens={faltando} className="mr-auto" />
        <AiImproveButton
          editorRef={editorRef as React.RefObject<any>}
          workspaceSlug={workspaceSlug}
          alvo={{ campo: "comentario", issue_id: entityId, project_id: projectId }}
        />
      </div>
    </div>
  );
});
