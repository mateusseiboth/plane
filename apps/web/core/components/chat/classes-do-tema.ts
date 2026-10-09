/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// O tema (`@plane/tailwind-config/variables.css`) desliga a paleta padrão do
// Tailwind com `--color-*: initial`. Classe de cor sem token (`bg-indigo-600`,
// `bg-primary`, `text-green-600`) não gera CSS e some em silêncio: a bolha do
// atendente e o botão de enviar ficavam transparentes. Puro: usado pelos testes
// para varrer o código do chat.

const PREFIXOS_DA_UTILIDADE: Record<string, string[]> = {
  bg: ["--background-color-", "--color-"],
  text: ["--text-color-", "--color-"],
  border: ["--border-color-", "--color-"],
  divide: ["--border-color-", "--color-"],
  ring: ["--ring-color-", "--color-"],
  outline: ["--outline-color-", "--color-"],
  fill: ["--color-"],
};

const PALAVRA_RESERVADA = "transparent|current|inherit|none";

// Utilidades com o mesmo prefixo que NÃO são cor (tamanho, alinhamento, largura...).
const WITHOUT_COR: Record<string, RegExp> = {
  bg: new RegExp(
    `^(${PALAVRA_RESERVADA}|clip-.*|origin-.*|blend-.*|fixed|local|scroll|cover|contain|auto|center|top|bottom|left|right|left-.*|right-.*|no-repeat|repeat.*|gradient-.*|linear-.*|radial-.*|conic-.*)$`
  ),
  text: new RegExp(
    `^(${PALAVRA_RESERVADA}|xs|sm|base|lg|xl|[0-9]xl|[0-9]+|left|right|center|justify|start|end|wrap|nowrap|ellipsis|clip|balance|pretty)$`
  ),
  border: new RegExp(`^(${PALAVRA_RESERVADA}|[0-9]+|solid|dashed|dotted|double|hidden|collapse|separate|spacing-.*)$`),
  divide: new RegExp(`^(${PALAVRA_RESERVADA}|[xy](-[0-9]+)?|[xy]-reverse|solid|dashed|dotted|double)$`),
  ring: new RegExp(`^(${PALAVRA_RESERVADA}|[0-9]+|inset|offset-.*)$`),
  outline: new RegExp(`^(${PALAVRA_RESERVADA}|[0-9]+|hidden|solid|dashed|dotted|double|offset-.*)$`),
  fill: new RegExp(`^(${PALAVRA_RESERVADA})$`),
};

const CLASSE =
  /(?<![\w-])(?:[\w-]+:)*(bg|text|border|divide|ring|outline|fill)-([a-z0-9][a-z0-9-]*)(?:\/[0-9]+)?(?![\w([-])/g;

// `border-t-subtle`: o lado vem antes da cor.
const LADO_DA_BORDA = /^[trblxyse]-(?![0-9]+$)/;

const COMENTARIO = /\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm;

const withoutComentario = (codigo: string) => codigo.replace(COMENTARIO, "$1");

const readNomeDaCor = (utilidade: string, nome: string) =>
  utilidade === "border" ? nome.replace(LADO_DA_BORDA, "") : nome;

const isLadoSemCor = (utilidade: string, nome: string) => utilidade === "border" && /^[trblxyse](-[0-9]+)?$/.test(nome);

const isCorDoTema = (tema: string, utilidade: string, nome: string) =>
  (PREFIXOS_DA_UTILIDADE[utilidade] ?? []).some((prefixo) => tema.includes(`${prefixo}${nome}:`));

/** Classes de cor do código que o tema não gera (sem repetir, na ordem em que aparecem). */
export function findClassesForaDoTema(codigo: string, tema: string): string[] {
  const achadas = [...withoutComentario(codigo).matchAll(CLASSE)]
    .filter(([, utilidade = "", nome = ""]) => !isLadoSemCor(utilidade, nome))
    .filter(([, utilidade = "", nome = ""]) => !WITHOUT_COR[utilidade]?.test(nome))
    .filter(([, utilidade = "", nome = ""]) => !isCorDoTema(tema, utilidade, readNomeDaCor(utilidade, nome)))
    .map(([classe]) => (classe.split(":").at(-1) ?? classe).replace(/\/[0-9]+$/, ""));
  return [...new Set(achadas)];
}
