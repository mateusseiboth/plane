/**
 * Esquema do bloco de anexo, sem visualização. É o que o servidor `live` usa para
 * converter HTML em documento Yjs: sem o nó aqui, o anexo sumiria da página.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { MarkdownSerializerState } from "@tiptap/pm/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { CORE_EXTENSIONS } from "@/constants/extension";
import { ATTACHMENT_ATTRIBUTES } from "./types";
import type {
  AttachmentExtensionOptions,
  AttachmentExtensionStorage,
  AttachmentExtensionType,
  InsertAttachmentComponentProps,
  TAttachmentAttributes,
} from "./types";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.ATTACHMENT]: {
      insertAttachmentComponent: (props: InsertAttachmentComponentProps) => ReturnType;
    };
  }
}

const NOVO_ANEXO: TAttachmentAttributes = { id: null, src: null, name: null, size: null, mimetype: null };

/** O tamanho volta do HTML como texto; o bloco trabalha com número. */
const parseSize = (element: HTMLElement) => {
  const valor = Number(element.getAttribute(ATTACHMENT_ATTRIBUTES.SIZE));
  return Number.isFinite(valor) && valor > 0 ? valor : null;
};

export const AttachmentExtensionConfig: AttachmentExtensionType = Node.create<
  AttachmentExtensionOptions,
  AttachmentExtensionStorage
>({
  name: CORE_EXTENSIONS.ATTACHMENT,
  group: "block",
  atom: true,

  addAttributes() {
    return {
      [ATTACHMENT_ATTRIBUTES.ID]: { default: NOVO_ANEXO.id },
      [ATTACHMENT_ATTRIBUTES.SOURCE]: { default: NOVO_ANEXO.src },
      [ATTACHMENT_ATTRIBUTES.NAME]: { default: NOVO_ANEXO.name },
      [ATTACHMENT_ATTRIBUTES.SIZE]: { default: NOVO_ANEXO.size, parseHTML: parseSize },
      [ATTACHMENT_ATTRIBUTES.MIME_TYPE]: { default: NOVO_ANEXO.mimetype },
    };
  },

  addStorage() {
    return {
      pendingFiles: new Map(),
      openPicker: new Set(),
      maxFileSize: 0,
      // O Markdown copiado leva só o nome do arquivo.
      markdown: {
        serialize(state: MarkdownSerializerState, node: ProseMirrorNode) {
          state.write(`Anexo: ${(node.attrs as TAttachmentAttributes).name ?? "arquivo"}`);
          state.closeBlock(node);
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "attachment-component" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["attachment-component", mergeAttributes(HTMLAttributes)];
  },
});
