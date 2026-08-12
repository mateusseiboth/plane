/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import { observer } from "mobx-react";
// plane imports
import { ETabIndices } from "@plane/constants";
import type { EditorRefApi } from "@plane/editor";
import { useTranslation } from "@plane/i18n";
import type { TIssue } from "@plane/types";
import { EFileAssetType } from "@plane/types";
import { Loader } from "@plane/ui";
import { getDescriptionPlaceholderI18n, getTabIndex, sanitizeHTML } from "@plane/utils";
// components
import { RichTextEditor } from "@/components/editor/rich-text/editor";
import { ItensFaltantes } from "@/components/ia";
// hooks
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useProjectInbox } from "@/hooks/store/use-project-inbox";
import { useContextoDeRequisito } from "@/hooks/use-contexto-de-requisito";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useTextoFantasmaCampo } from "@/hooks/use-texto-fantasma-campo";
import { useTextoFantasmaEditor } from "@/hooks/use-texto-fantasma-editor";
import { useTipoDeRequisito } from "@/hooks/use-tipo-de-requisito";
// services
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

type TInboxIssueDescription = {
  containerClassName?: string;
  workspaceSlug: string;
  projectId: string;
  workspaceId: string;
  data: Partial<TIssue>;
  handleData: (issueKey: keyof Partial<TIssue>, issueValue: Partial<TIssue>[keyof Partial<TIssue>]) => void;
  editorRef: RefObject<EditorRefApi>;
  onEnterKeyPress?: (e?: any) => void;
  onAssetUpload?: (assetId: string) => void;
};

// TODO: have to implement GPT Assistance
export const InboxIssueDescription = observer(function InboxIssueDescription(props: TInboxIssueDescription) {
  const {
    containerClassName,
    workspaceSlug,
    projectId,
    workspaceId,
    data,
    handleData,
    editorRef,
    onEnterKeyPress,
    onAssetUpload,
  } = props;
  // i18n
  const { t } = useTranslation();
  // store hooks
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const { loader } = useProjectInbox();
  const { isMobile } = usePlatformOS();
  // texto fantasma da IA de requisitos
  const tipo = useTipoDeRequisito(data?.label_ids);
  const { projeto } = useContextoDeRequisito({ workspaceSlug, projectId });
  const { sugestao, faltando, propsDeFoco } = useTextoFantasmaCampo({
    workspaceSlug,
    campo: "descricao",
    texto: sanitizeHTML(data?.description_html ?? ""),
    projectId,
    issueId: data?.id,
    tipo,
    contexto: { projeto, titulo: data?.name },
  });
  const { extensoes } = useTextoFantasmaEditor(sugestao);

  const { getIndex } = getTabIndex(ETabIndices.INTAKE_ISSUE_FORM, isMobile);

  if (loader === "issue-loading")
    return (
      <Loader className="min-h-[6rem] rounded-md border border-subtle">
        <Loader.Item width="100%" height="140px" />
      </Loader>
    );

  return (
    <div {...propsDeFoco}>
      <RichTextEditor
        editable
        id="inbox-modal-editor"
        initialValue={!data?.description_html || data?.description_html === "" ? "<p></p>" : data?.description_html}
        ref={editorRef}
        extensions={extensoes}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={projectId}
        dragDropEnabled={false}
        onChange={(_description: object, description_html: string) => handleData("description_html", description_html)}
        placeholder={(isFocused, description) => t(`${getDescriptionPlaceholderI18n(isFocused, description)}`)}
        searchMentionCallback={async (payload) =>
          await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
            ...payload,
            project_id: projectId?.toString() ?? "",
          })
        }
        containerClassName={containerClassName}
        onEnterKeyPress={onEnterKeyPress}
        tabIndex={getIndex("description_html")}
        uploadFile={async (blockId, file) => {
          try {
            const { asset_id } = await uploadEditorAsset({
              blockId,
              data: {
                entity_identifier: data.id ?? "",
                entity_type: EFileAssetType.ISSUE_DESCRIPTION,
              },
              file,
              projectId,
              workspaceSlug,
            });
            onAssetUpload?.(asset_id);
            return asset_id;
          } catch (error) {
            console.log("Error in uploading work item asset:", error);
            throw new Error("Falha ao enviar o arquivo. Tente novamente mais tarde.");
          }
        }}
        duplicateFile={async (assetId: string) => {
          try {
            const { asset_id } = await duplicateEditorAsset({
              assetId,
              entityType: EFileAssetType.ISSUE_DESCRIPTION,
              projectId,
              workspaceSlug,
            });
            onAssetUpload?.(asset_id);
            return asset_id;
          } catch {
            throw new Error("Falha ao duplicar o arquivo. Tente novamente mais tarde.");
          }
        }}
      />
      <ItensFaltantes itens={faltando} className="mt-1.5" />
    </div>
  );
});
