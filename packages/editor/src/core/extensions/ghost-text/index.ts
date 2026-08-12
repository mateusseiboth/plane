/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const GHOST_TEXT_EXTENSION_NAME = "ghostText";

/**
 * Texto fantasma: a sugestão aparece em cinza à frente do cursor e só entra no
 * documento quando a pessoa aceita com `Tab`. `Esc` descarta e continuar
 * digitando substitui.
 *
 * Quem sabe o que sugerir (a IA) vive fora do editor. A extensão recebe uma
 * fonte externa e apenas desenha o que ela disser — assim nenhuma chamada de
 * rede entra no pacote do editor.
 */

export type TGhostTextSource = {
  /** Sugestão atual. String vazia significa "não há nada a mostrar". */
  getSnapshot: () => string;
  /** Registra um interessado nas mudanças; devolve o cancelamento. */
  subscribe: (listener: () => void) => () => void;
  /** Avisa que a pessoa aceitou a sugestão com `Tab`. */
  onAccept?: (text: string) => void;
  /** Avisa que a pessoa descartou a sugestão com `Esc`. */
  onDismiss?: (text: string) => void;
};

type TGhostTextOptions = {
  source: TGhostTextSource | null;
};

type TGhostTextState = {
  text: string;
};

const EMPTY_STATE: TGhostTextState = { text: "" };

const ghostTextPluginKey = new PluginKey<TGhostTextState>(GHOST_TEXT_EXTENSION_NAME);

const renderGhost = (text: string) => {
  const span = document.createElement("span");
  span.className = "pointer-events-none select-none whitespace-pre-wrap text-placeholder";
  span.setAttribute("data-ghost-text", "true");
  span.setAttribute("aria-hidden", "true");
  span.textContent = text;
  return span;
};

/**
 * A sugestão é a continuação do que já foi escrito, então só faz sentido no fim
 * do documento. No meio do texto o fantasma mentiria sobre o que está
 * continuando — melhor não aparecer.
 */
const atDocumentEnd = (state: EditorState) => state.selection.head >= state.doc.content.size - 1;

const readGhostText = (state: EditorState) => ghostTextPluginKey.getState(state)?.text ?? "";

/**
 * O que está de fato desenhado na tela — é isto que o `Tab` aceita. Aceitar
 * algo que a pessoa não está vendo seria pior do que não sugerir nada.
 */
const visibleGhostText = (state: EditorState) => {
  // seleção aberta = a pessoa está escolhendo trecho, não escrevendo
  if (!state.selection.empty || !atDocumentEnd(state)) return "";
  return readGhostText(state);
};

const buildDecorations = (state: EditorState) => {
  const text = visibleGhostText(state);
  if (!text) return DecorationSet.empty;
  const widget = Decoration.widget(state.selection.head, () => renderGhost(text), {
    side: 1,
    ignoreSelection: true,
    key: `${GHOST_TEXT_EXTENSION_NAME}-${text}`,
  });
  return DecorationSet.create(state.doc, [widget]);
};

const setGhostText = (editor: Editor, text: string) => {
  if (readGhostText(editor.state) === text) return;
  editor.view.dispatch(editor.state.tr.setMeta(ghostTextPluginKey, { text }));
};

/**
 * Insere a sugestão sem passar pelo parser de HTML: o modelo devolve texto
 * corrido e um `<` no meio de uma regra não pode virar marcação.
 */
const insertGhostText = (editor: Editor, text: string) => {
  const chain = editor.chain();
  text.split("\n").forEach((line, index) => {
    if (index > 0) chain.splitBlock();
    if (line.length > 0) chain.insertContent({ type: "text", text: line });
  });
  return chain.run();
};

/**
 * Tab e Esc são tratados aqui, e não em `addKeyboardShortcuts`, porque só neste
 * ponto existe o evento do DOM: sem `stopPropagation` o Esc chegaria ao
 * `document` e fecharia o modal do chamado em vez de descartar a sugestão.
 */
const ACTIONS: Record<string, (editor: Editor, source: TGhostTextSource | null, text: string) => boolean> = {
  Tab: (editor, source, text) => {
    source?.onAccept?.(text);
    setGhostText(editor, "");
    return insertGhostText(editor, text);
  },
  Escape: (editor, source, text) => {
    source?.onDismiss?.(text);
    setGhostText(editor, "");
    return true;
  },
};

/** O que esta transação inseriu de texto. Vazio quando não deu para saber. */
function textoInserido(tr: Transaction): string {
  let inserido = "";
  for (const passo of tr.steps) {
    const fatia = (passo as unknown as { slice?: { content: { size: number; textBetween: (de: number, ate: number, sep: string) => string } } }).slice;
    if (!fatia) return "";
    inserido += fatia.content.textBetween(0, fatia.content.size, "\n");
  }
  return inserido;
}

/**
 * Encurta a sugestão pelo que a pessoa acabou de digitar.
 *
 * Quem digita a primeira letra do que estava sugerido vê a sugestão encolher em
 * vez de sumir. Se o que foi digitado não casa com o começo dela, a sugestão
 * fica como está: ela pode estar desatualizada por um instante, mas some
 * piscando é pior — a resposta nova chega e substitui.
 */
function consumirDigitado(tr: Transaction, texto: string): string {
  if (!texto) return "";
  const digitado = textoInserido(tr);
  // Apagou, ou passo que não é inserção de texto: mantém o que estava.
  if (!digitado) return texto;
  return texto.startsWith(digitado) ? texto.slice(digitado.length) : texto;
}

const createGhostTextPlugin = (editor: Editor, options: TGhostTextOptions) =>
  new Plugin<TGhostTextState>({
    key: ghostTextPluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply: (tr, value) => {
        const meta = tr.getMeta(ghostTextPluginKey) as TGhostTextState | undefined;
        if (meta) return { text: meta.text };
        // A sugestão SOBREVIVE à digitação, de propósito. Apagá-la a cada tecla
        // e esperar a próxima resposta fazia o texto piscar e sumir o tempo
        // todo enquanto se escreve — o pedido é deixar a anterior no lugar e
        // apenas substituí-la quando a nova chegar.
        //
        // O que a digitação faz é CONSUMIR o que já foi escrito: quem digita a
        // primeira letra da sugestão vê a sugestão encurtar, não desaparecer.
        if (tr.docChanged) return { text: consumirDigitado(tr, value.text) };
        // Mover o cursor é outra história: a continuação era daquele ponto.
        if (tr.selectionSet) return EMPTY_STATE;
        return value;
      },
    },
    props: {
      decorations: (state) => buildDecorations(state),
      handleKeyDown: (view, event) => {
        const action = ACTIONS[event.key];
        if (!action) return false;
        const text = visibleGhostText(view.state);
        if (!text) return false;
        event.preventDefault();
        event.stopPropagation();
        return action(editor, options.source, text);
      },
    },
    view: (view) => {
      const { source } = options;
      if (!source) return {};

      let destroyed = false;
      const sync = () => {
        if (destroyed || view.isDestroyed) return;
        const text = source.getSnapshot();
        if (readGhostText(view.state) === text) return;
        view.dispatch(view.state.tr.setMeta(ghostTextPluginKey, { text }));
      };

      const unsubscribe = source.subscribe(sync);
      // fora da construção da view: despachar aqui dentro quebraria o editor
      queueMicrotask(sync);

      return {
        destroy: () => {
          destroyed = true;
          unsubscribe();
        },
      };
    },
  });

export const GhostTextExtension = Extension.create<TGhostTextOptions>({
  name: GHOST_TEXT_EXTENSION_NAME,
  // acima do keymap de listas e do bloco de código, que também querem o Tab
  priority: 1000,

  addOptions() {
    return { source: null };
  },

  addProseMirrorPlugins() {
    return [createGhostTextPlugin(this.editor, this.options)];
  },
});

/**
 * Fábrica pública: quem consome monta a extensão sem precisar do tiptap como
 * dependência direta.
 */
export const createGhostTextExtension = (source: TGhostTextSource) => GhostTextExtension.configure({ source });
