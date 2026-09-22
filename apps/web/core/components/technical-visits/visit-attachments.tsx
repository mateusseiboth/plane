/**
 * Anexos do relatório da visita. Em "Aguardando Assinatura" o arquivo enviado é
 * o relatório assinado e a API conclui a visita ao recebê-lo.
 */
import { useRef, useState } from "react";
import { Download, Paperclip, Trash2, Upload } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { technicalVisitService } from "@/services/technical-visit.service";
import type { TTechnicalVisit, TVisitApiError, TVisitAttachment } from "./types";
import { VisitFieldError, formatDateTime } from "./visit-display";
import { VISIT_STATUS, mapVisitErrors } from "./visit-rules";

type Props = {
  workspaceSlug: string;
  visit: TTechnicalVisit;
  editable: boolean;
  onChange: (visit: TTechnicalVisit) => void;
  /** Recusa ao concluir pelo anexo: cada campo que falta volta para a tela. */
  onErrors: (errors: Record<string, string>) => void;
};

const formatTamanho = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const saveBlob = (blob: Blob, nome: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
};

export function VisitAttachments({ workspaceSlug, visit, editable, onChange, onErrors }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const aguardandoAssinatura = visit.status === VISIT_STATUS.AGUARDANDO_ASSINATURA;
  const anexos = visit.attachments ?? [];

  const onUpload = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setEnviando(true);
    setErro(undefined);
    try {
      const atualizada = await technicalVisitService.uploadAttachment(workspaceSlug, visit.id, arquivo);
      onChange(atualizada);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title:
          atualizada.status === VISIT_STATUS.CONCLUIDA && aguardandoAssinatura
            ? "Visita concluída."
            : "Arquivo anexado.",
      });
    } catch (falha) {
      const campos = mapVisitErrors(falha);
      setErro(campos.file);
      onErrors(campos);
      setToast({ type: TOAST_TYPE.ERROR, title: "Arquivo não anexado.", message: (falha as TVisitApiError)?.detail });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDownload = (anexo: TVisitAttachment) =>
    technicalVisitService
      .downloadAttachment(workspaceSlug, visit.id, anexo.id)
      .then((blob) => saveBlob(blob, anexo.name))
      .catch(() => setToast({ type: TOAST_TYPE.ERROR, title: "Não foi possível baixar o arquivo." }));

  const onRemove = (anexo: TVisitAttachment) =>
    technicalVisitService
      .removeAttachment(workspaceSlug, visit.id, anexo.id)
      .then(() => onChange({ ...visit, attachments: anexos.filter((a) => a.id !== anexo.id) }))
      .catch((falha) =>
        setToast({ type: TOAST_TYPE.ERROR, title: "Arquivo não removido.", message: (falha as TVisitApiError)?.detail })
      );

  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-13 font-medium">
        <Paperclip className="h-4 w-4 text-secondary" />
        Anexos do relatório
      </div>
      {aguardandoAssinatura && editable && (
        <p className="mb-2 rounded bg-warning-subtle px-3 py-2 text-12 text-warning-primary">
          Anexe o relatório assinado para concluir a visita.
        </p>
      )}
      {anexos.length === 0 && <p className="text-12 text-tertiary">Nenhum arquivo anexado.</p>}
      <ul className="divide-y divide-subtle rounded border border-subtle">
        {anexos.map((anexo) => (
          <li key={anexo.id} className="flex items-center gap-3 px-3 py-2 text-13">
            <span className="min-w-0 flex-1 truncate">{anexo.name}</span>
            <span className="shrink-0 text-11 text-tertiary">
              {formatTamanho(anexo.size)} · {formatDateTime(anexo.created_at)}
            </span>
            <button
              type="button"
              onClick={() => onDownload(anexo)}
              className="shrink-0 rounded p-1 text-tertiary hover:text-primary"
              aria-label={`Baixar ${anexo.name}`}
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            {editable && (
              <button
                type="button"
                onClick={() => onRemove(anexo)}
                className="shrink-0 rounded p-1 text-tertiary hover:text-danger-primary"
                aria-label={`Remover ${anexo.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <VisitFieldError message={erro} />
      {editable && (
        <>
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
          <button
            type="button"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
            className="hover:border-accent-primary mt-3 inline-flex items-center gap-2 rounded border border-subtle px-3 py-1.5 text-13 text-secondary hover:text-accent-primary disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {enviando ? "Enviando..." : aguardandoAssinatura ? "Anexar relatório assinado" : "Anexar arquivo"}
          </button>
        </>
      )}
    </section>
  );
}
