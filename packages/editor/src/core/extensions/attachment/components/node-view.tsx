/**
 * Cartão do anexo. Com arquivo: nome, tamanho e link para baixar. Sem arquivo
 * (recém-inserido): o botão de envio, para quem pode editar.
 */
import { NodeViewWrapper } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import { Download, Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn, convertBytesToSize } from "@plane/utils";
import type { AttachmentExtensionType, TAttachmentAttributes } from "../types";

export type AttachmentNodeViewProps = Omit<NodeViewProps, "extension" | "updateAttributes"> & {
  extension: AttachmentExtensionType;
  node: NodeViewProps["node"] & { attrs: TAttachmentAttributes };
  updateAttributes: (attrs: Partial<TAttachmentAttributes>) => void;
};

const BYTES_POR_MB = 1024 * 1024;

export function AttachmentNodeView(props: AttachmentNodeViewProps) {
  const { editor, extension, node, selected, updateAttributes } = props;
  const { id, src, name, size } = node.attrs;
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      const upload = extension.options.upload;
      if (!upload || !id) return;
      const limite = extension.storage.maxFileSize;
      if (limite && file.size > limite) {
        setErro(`O arquivo passa do limite de ${Math.round(limite / BYTES_POR_MB)} MB.`);
        return;
      }
      setEnviando(true);
      setErro(null);
      try {
        const assetId = await upload(id, file);
        updateAttributes({ src: assetId, name: file.name, size: file.size, mimetype: file.type || null });
      } catch {
        setErro("Não foi possível enviar o arquivo. Tente de novo.");
      } finally {
        setEnviando(false);
      }
    },
    [extension, id, updateAttributes]
  );

  // Arquivo solto no editor: envia assim que o bloco aparece. Inserido pelo
  // menu "/": abre o seletor uma vez, só na aba de quem inseriu.
  useEffect(() => {
    if (src || !id) return;
    const pendente = extension.storage.pendingFiles.get(id);
    if (pendente) {
      extension.storage.pendingFiles.delete(id);
      void uploadFile(pendente);
      return;
    }
    if (!extension.storage.openPicker.delete(id)) return;
    inputRef.current?.click();
  }, [extension, id, src, uploadFile]);

  // O link de download depende de onde o arquivo mora (espaço ou sistema).
  useEffect(() => {
    if (!src) return;
    let ativo = true;
    extension.options
      .getDownloadSource(src)
      .then((url) => ativo && setDownloadUrl(url))
      .catch(() => ativo && setDownloadUrl(undefined));
    return () => {
      ativo = false;
    };
  }, [extension, src]);

  const podeEnviar = editor.isEditable && !!extension.options.upload;

  return (
    <NodeViewWrapper>
      <div
        data-drag-handle
        contentEditable={false}
        className={cn("not-prose my-2 flex items-center gap-3 rounded-md border border-subtle bg-layer-1 px-3 py-2", {
          "border-accent-subtle-1 bg-accent-subtle": selected,
        })}
      >
        <Paperclip className="size-4 flex-shrink-0 text-tertiary" />
        {src ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-14 text-primary">{name ?? "Arquivo"}</p>
              {size ? <p className="text-12 text-tertiary">{convertBytesToSize(size)}</p> : null}
            </div>
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Baixar ${name ?? "arquivo"}`}
                className="grid size-7 flex-shrink-0 place-items-center rounded-sm text-secondary hover:bg-layer-2"
              >
                <Download className="size-4" />
              </a>
            )}
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <p className={cn("truncate text-13", erro ? "text-danger-primary" : "text-tertiary")}>
              {erro ?? (enviando ? "Enviando arquivo..." : "Anexo sem arquivo.")}
            </p>
            {podeEnviar && !enviando && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex-shrink-0 rounded-sm px-2 py-1 text-13 text-accent-primary hover:bg-layer-2"
              >
                Escolher arquivo
              </button>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (arquivo) void uploadFile(arquivo);
              }}
            />
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
