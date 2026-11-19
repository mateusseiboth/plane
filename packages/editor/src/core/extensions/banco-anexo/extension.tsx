/**
 * Banco anexado ao texto (testes da nova intranet 3, 19/11/2026): o backup do
 * cliente fica gravado no HTML como `<banco-anexo data-envio=…>`, e quem abre
 * o texto clica para baixar. O link do servidor de backups expira a cada hora;
 * o bloco guarda só QUAL backup é, e o link nasce a cada clique.
 *
 * O pacote só define o nó. O botão (e o download) é do web, por `render`.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { ReactNode } from "react";

export const BANCO_ANEXO_NODE = "bancoAnexo";
export const BANCO_ANEXO_TAG = "banco-anexo";

export type TBancoAnexoAttrs = {
  envio: string | null;
  nome: string | null;
  entidade: string | null;
  sistema: string | null;
  recebidoEm: string | null;
};

const ATRIBUTOS: Record<keyof TBancoAnexoAttrs, string> = {
  envio: "data-envio",
  nome: "data-nome",
  entidade: "data-entidade",
  sistema: "data-sistema",
  recebidoEm: "data-recebido-em",
};

const buildAtributo = (chave: keyof TBancoAnexoAttrs) => ({
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute(ATRIBUTOS[chave]),
  renderHTML: (attrs: TBancoAnexoAttrs) => (attrs[chave] ? { [ATRIBUTOS[chave]]: attrs[chave] } : {}),
});

export type TBancoAnexoRender = (props: {
  attrs: TBancoAnexoAttrs;
  editable: boolean;
  remove: () => void;
}) => ReactNode;

export const createBancoAnexoExtension = ({ render }: { render: TBancoAnexoRender }) =>
  Node.create({
    name: BANCO_ANEXO_NODE,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
      return {
        envio: buildAtributo("envio"),
        nome: buildAtributo("nome"),
        entidade: buildAtributo("entidade"),
        sistema: buildAtributo("sistema"),
        recebidoEm: buildAtributo("recebidoEm"),
      };
    },

    parseHTML() {
      return [{ tag: BANCO_ANEXO_TAG }];
    },

    renderHTML({ HTMLAttributes }) {
      return [BANCO_ANEXO_TAG, mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
      return ReactNodeViewRenderer((props: NodeViewProps) => (
        <NodeViewWrapper>
          {render({
            attrs: props.node.attrs as TBancoAnexoAttrs,
            editable: props.editor.isEditable,
            remove: () => props.deleteNode(),
          })}
        </NodeViewWrapper>
      ));
    },
  });

/** Troca o "/banco" digitado pelo bloco do banco escolhido. */
export const insertBancoAnexo = (editor: Editor, range: Range, attrs: TBancoAnexoAttrs) =>
  editor.chain().focus().deleteRange(range).insertContent({ type: BANCO_ANEXO_NODE, attrs }).run();
