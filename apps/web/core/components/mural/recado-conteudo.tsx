/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Paperclip } from "lucide-react";
import { getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { RichTextEditor } from "@/components/editor/rich-text/editor";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import type { TMuralRecado } from "@/services/mural.service";

type Props = { workspaceSlug: string; recado: TMuralRecado };

/** Linha de autoria: quem publicou e quando. */
export function MuralRecadoAutoria({ recado }: { recado: TMuralRecado }) {
  const quando = `${renderFormattedDate(recado.published_at) ?? ""} ${renderFormattedTime(recado.published_at)}`;
  return (
    <p className="text-11 text-tertiary">
      {recado.author?.display_name ?? "Autor removido"} · {quando}
      {recado.expires_at && ` · válido até ${renderFormattedDate(recado.expires_at)}`}
    </p>
  );
}

/** Texto rico do recado (somente leitura) e o anexo, quando houver. */
export const MuralRecadoConteudo = observer(function MuralRecadoConteudo({ workspaceSlug, recado }: Props) {
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = getWorkspaceBySlug(workspaceSlug)?.id ?? "";

  return (
    <div className="space-y-3">
      <RichTextEditor
        key={`${recado.id}-${recado.updated_at}`}
        editable={false}
        id={`mural-${recado.id}`}
        initialValue={recado.description_html || "<p></p>"}
        containerClassName="p-0 !pl-0 border-none"
        editorClassName="pl-0"
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
      {recado.attachment && (
        <a
          href={getFileURL(recado.attachment.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded border border-subtle px-2 py-1 text-12 text-accent-primary hover:bg-surface-2"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {recado.attachment.name}
        </a>
      )}
    </div>
  );
});
