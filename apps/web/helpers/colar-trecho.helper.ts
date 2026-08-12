/**
 * Cola um trecho sugerido pela IA no editor de onde a análise saiu.
 *
 * O `insertText` do editor desiste quando não há seleção (`if (empty) return`),
 * e no momento do clique o foco está no botão, não no texto. Então o caminho
 * confiável é o determinístico: ler o documento, acrescentar o trecho ao fim e
 * reescrever pedindo emissão — é o `onChange` do editor que avisa o formulário.
 */
import type { EditorRefApi } from "@plane/editor";

type TRefDeEditor = { current: EditorRefApi | null };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

const escapar = (texto: string): string => texto.replace(/[&<>]/g, (caractere) => ESCAPES[caractere]);

/** Uma linha, um parágrafo — o trecho vem em texto puro. */
const comoParagrafos = (trecho: string): string =>
  trecho
    .split("\n")
    .map((linha) => `<p>${escapar(linha)}</p>`)
    .join("");

/** Editor recém-criado guarda `<p></p>`; acrescentar a isso deixaria linha vazia. */
const VAZIOS = ["", "<p></p>"];

export const colarTrechoNoEditor = (editorRef: TRefDeEditor) => (trecho: string) => {
  const editor = editorRef.current;
  if (!editor) return;
  const atual = editor.getDocument().html ?? "";
  const base = VAZIOS.includes(atual.trim()) ? "" : atual;
  editor.setEditorValue(`${base}${comoParagrafos(trecho)}`, true);
};
