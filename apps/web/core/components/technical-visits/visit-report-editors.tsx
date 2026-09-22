/**
 * Resumo e conclusão da visita, no editor rico do Plane.
 */
import { useRef } from "react";
import { observer } from "mobx-react";
import { Building2, Calendar } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EditorRefApi } from "@plane/editor";
import { EFileAssetType } from "@plane/types";
import { RichTextEditor } from "@/components/editor/rich-text";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { WorkspaceService } from "@/services/workspace.service";
import { VisitFieldError } from "./visit-display";

const workspaceService = new WorkspaceService();

type TEditorProps = {
  workspaceSlug: string;
  workspaceId: string;
  visitId: string;
  campo: "summary" | "conclusion";
  titulo: string;
  icone: LucideIcon;
  placeholder: string;
  editable: boolean;
  value: string;
  onChange: (html: string) => void;
  error?: string;
};

const VisitRichText = observer(function VisitRichText(props: TEditorProps) {
  const {
    workspaceSlug,
    workspaceId,
    visitId,
    campo,
    titulo,
    icone: Icone,
    placeholder,
    editable,
    value,
    onChange,
    error,
  } = props;
  const editorRef = useRef<EditorRefApi>(null);
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-13 font-medium">
        <Icone className="h-4 w-4 text-secondary" />
        {titulo}
      </div>
      <RichTextEditor
        editable={editable}
        ref={editorRef}
        id={`visit-${campo}-${visitId}`}
        initialValue={value || "<p></p>"}
        workspaceSlug={workspaceSlug}
        workspaceId={workspaceId}
        projectId={undefined}
        dragDropEnabled
        onChange={(_json, html) => onChange(html)}
        placeholder={placeholder}
        searchMentionCallback={async (payload) =>
          await workspaceService.searchEntity(workspaceSlug, { ...payload, project_id: "" })
        }
        containerClassName="min-h-[160px]"
        uploadFile={async (blockId, file) => {
          const { asset_id } = await uploadEditorAsset({
            blockId,
            data: { entity_identifier: visitId, entity_type: EFileAssetType.ISSUE_DESCRIPTION },
            file,
            projectId: undefined,
            workspaceSlug,
          });
          return asset_id;
        }}
        duplicateFile={async (assetId: string) => {
          const { asset_id } = await duplicateEditorAsset({
            assetId,
            entityType: EFileAssetType.ISSUE_DESCRIPTION,
            projectId: undefined,
            workspaceSlug,
          });
          return asset_id;
        }}
      />
      <VisitFieldError message={error} />
    </section>
  );
});

type Props = {
  workspaceSlug: string;
  visitId: string;
  editable: boolean;
  summary: string;
  conclusion: string;
  onSummaryChange: (html: string) => void;
  onConclusionChange: (html: string) => void;
  errors: { summary?: string; conclusion?: string };
};

export const VisitReportEditors = observer(function VisitReportEditors(props: Props) {
  const { workspaceSlug, visitId, editable, summary, conclusion, onSummaryChange, onConclusionChange, errors } = props;
  const { currentWorkspace } = useWorkspace();
  if (!currentWorkspace) return null;

  const comum = { workspaceSlug, workspaceId: currentWorkspace.id, visitId, editable };
  return (
    <>
      <VisitRichText
        {...comum}
        campo="summary"
        titulo="Resumo (situação da entidade antes da visita)"
        icone={Calendar}
        placeholder="Como a entidade estava antes da visita"
        value={summary}
        onChange={onSummaryChange}
        error={errors.summary}
      />
      <VisitRichText
        {...comum}
        campo="conclusion"
        titulo="Conclusão (situação da entidade depois da visita)"
        icone={Building2}
        placeholder="Como a entidade ficou depois da visita"
        value={conclusion}
        onChange={onConclusionChange}
        error={errors.conclusion}
      />
    </>
  );
});
