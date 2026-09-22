/**
 * Bloco de anexo com visualização: comando de inserção (menu "/" e arquivo
 * solto no editor) e o cartão do arquivo. O envio usa o mesmo `fileHandler` das
 * imagens (`upload` devolve o id do arquivo no armazenamento).
 */
import { ReactNodeViewRenderer } from "@tiptap/react";
import { v4 as uuidv4 } from "uuid";
import { insertEmptyParagraphAtNodeBoundaries } from "@/helpers/insert-empty-paragraph-at-node-boundary";
import type { TFileHandler } from "@/types";
import { AttachmentNodeView } from "./components/node-view";
import type { AttachmentNodeViewProps } from "./components/node-view";
import { AttachmentExtensionConfig } from "./extension-config";
import type { AttachmentExtensionOptions, AttachmentExtensionStorage } from "./types";

type Props = {
  fileHandler: TFileHandler;
  isEditable: boolean;
};

export function AttachmentExtension(props: Props) {
  const { fileHandler, isEditable } = props;

  return AttachmentExtensionConfig.extend<AttachmentExtensionOptions, AttachmentExtensionStorage>({
    selectable: isEditable,
    draggable: isEditable,

    addOptions() {
      return {
        ...this.parent?.(),
        getDownloadSource: fileHandler.getAssetDownloadSrc,
        upload: "upload" in fileHandler ? fileHandler.upload : undefined,
      };
    },

    addStorage() {
      return {
        ...this.parent?.(),
        pendingFiles: new Map<string, File>(),
        openPicker: new Set<string>(),
        maxFileSize: "validation" in fileHandler ? (fileHandler.validation?.maxFileSize ?? 0) : 0,
      };
    },

    addCommands() {
      return {
        insertAttachmentComponent:
          ({ file, pos, event }) =>
          ({ commands }) => {
            const id = uuidv4();
            if (file) this.storage.pendingFiles.set(id, file);
            if (!file && event === "insert") this.storage.openPicker.add(id);
            const content = { type: this.name, attrs: { id } };
            return pos === undefined ? commands.insertContent(content) : commands.insertContentAt(pos, content);
          },
      };
    },

    addKeyboardShortcuts() {
      return {
        ArrowDown: insertEmptyParagraphAtNodeBoundaries("down", this.name),
        ArrowUp: insertEmptyParagraphAtNodeBoundaries("up", this.name),
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer((nodeProps) => (
        <AttachmentNodeView {...(nodeProps as unknown as AttachmentNodeViewProps)} />
      ));
    },
  });
}
