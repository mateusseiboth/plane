/**
 * Bloco de anexo do editor: um arquivo qualquer (PDF, planilha, documento)
 * enviado para o armazenamento de arquivos e mostrado como um cartão com nome,
 * tamanho e link para baixar. A imagem continua no bloco de imagem.
 */
import type { Node } from "@tiptap/core";
import type { TFileHandler } from "@/types";

/** Atributos gravados no HTML (`<attachment-component ...>`). */
export const ATTACHMENT_ATTRIBUTES = {
  ID: "id",
  SOURCE: "src",
  NAME: "name",
  SIZE: "size",
  MIME_TYPE: "mimetype",
} as const;

export type TAttachmentAttributes = {
  id: string | null;
  /** Id do arquivo no armazenamento; nulo enquanto o envio não termina. */
  src: string | null;
  name: string | null;
  size: number | null;
  mimetype: string | null;
};

export type InsertAttachmentComponentProps = {
  file?: File;
  pos?: number;
  event: "insert" | "drop";
};

export type AttachmentExtensionOptions = {
  getDownloadSource: TFileHandler["getAssetDownloadSrc"];
  upload?: TFileHandler["upload"];
};

export type AttachmentExtensionStorage = {
  /** Arquivo solto no editor, à espera de envio, por id do bloco. */
  pendingFiles: Map<string, File>;
  /** Blocos inseridos pelo menu "/" nesta aba: abrem o seletor de arquivo uma vez. */
  openPicker: Set<string>;
  maxFileSize: number;
  markdown?: unknown;
};

export type AttachmentExtensionType = Node<AttachmentExtensionOptions, AttachmentExtensionStorage>;
