import { useState } from "react";
import { Database, Download, X } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TBancoAnexoAttrs } from "@plane/editor";
import { readRotuloDoBanco, waitPreparacao } from "@/components/banco-anexo/banco-anexo";
import { bancoAnexoService } from "@/services/banco-anexo.service";

type Props = {
  attrs: TBancoAnexoAttrs;
  editable: boolean;
  remove: () => void;
  workspaceSlug: string;
  projectId: string | undefined;
};

/** Abre o arquivo pronto no navegador, que baixa com o progresso dele. */
const openArquivo = (url: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.rel = "noopener";
  link.click();
};

/**
 * O bloco do banco anexado: cada clique pede um link novo ao servidor de
 * backups (o antigo expira de hora em hora) e baixa o arquivo.
 */
export function BancoAnexado({ attrs, editable, remove, workspaceSlug, projectId }: Props) {
  const [isPreparando, setIsPreparando] = useState(false);

  const handleBaixar = async () => {
    if (!projectId || !attrs.envio) return;
    setIsPreparando(true);
    try {
      const inicial = await bancoAnexoService.createPreparacao(workspaceSlug, projectId, attrs.envio);
      const url = await waitPreparacao(inicial, (id) => bancoAnexoService.readPreparacao(workspaceSlug, projectId, id));
      openArquivo(url);
    } catch (erro) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível baixar o banco",
        message:
          (erro as { detail?: string; message?: string })?.detail ?? (erro as Error)?.message ?? "Tente de novo.",
      });
    } finally {
      setIsPreparando(false);
    }
  };

  return (
    <div
      className="my-1 flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-3 py-2 text-13"
      contentEditable={false}
    >
      <Database className="size-4 shrink-0 text-secondary" />
      <span className="min-w-0 flex-1 truncate">{readRotuloDoBanco(attrs)}</span>
      <button
        type="button"
        className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-12 font-medium text-accent-primary hover:bg-layer-1-hover disabled:opacity-60"
        onClick={() => void handleBaixar()}
        disabled={isPreparando || !projectId}
        title={projectId ? undefined : "Salve o texto para baixar."}
      >
        <Download className="size-3.5" />
        {isPreparando ? "Preparando o banco" : "Baixar"}
      </button>
      {editable && (
        <button type="button" className="shrink-0 rounded p-1 text-secondary hover:bg-layer-1-hover" onClick={remove}>
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
