/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TReferencia } from "@mateusseiboth/widgets-aviao/referencia-tipos";

export type TItemDoIndice = { id: string; titulo: string; termos: string[] };
export type TSecaoDoIndice = { id: string; titulo: string; itens: TItemDoIndice[] };

const normalize = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Sem busca, tudo aparece; com busca, cada palavra precisa estar em algum termo. */
export function isItemDaBusca(termos: string[], busca: string): boolean {
  const palavras = normalize(busca).split(/\s+/).filter(Boolean);
  const texto = normalize(termos.join(" "));
  return palavras.every((palavra) => texto.includes(palavra));
}

/** Seções do índice, na ordem da página. As que têm itens listam um por hook, API, tipo etc. */
const buildSecoes = (r: TReferencia): TSecaoDoIndice[] => [
  { id: "instalar", titulo: "Instalar o SDK", itens: [] },
  { id: "tutorial", titulo: "Tutorial: do zero à home", itens: [] },
  { id: "manifesto", titulo: "Manifesto", itens: [] },
  { id: "permissoes", titulo: "Permissões", itens: [] },
  {
    id: "hooks",
    titulo: "Hooks",
    itens: r.hooks.map((h) => ({ id: `hook-${h.nome}`, titulo: h.nome, termos: [h.nome, h.descricao, h.permissao] })),
  },
  {
    id: "apis",
    titulo: "APIs",
    itens: r.apis.map((a) => ({
      id: `api-${a.nome}`,
      titulo: a.nome,
      termos: [a.nome, a.descricao, a.permissao, ...a.metodos.flatMap((m) => [m.nome, m.descricao])],
    })),
  },
  {
    id: "funcoes",
    titulo: "Funções",
    itens: r.funcoes.map((f) => ({ id: `funcao-${f.nome}`, titulo: f.nome, termos: [f.nome, f.descricao] })),
  },
  {
    id: "tipos",
    titulo: "Tipos",
    itens: r.tipos.map((t) => ({
      id: `tipo-${t.nome}`,
      titulo: t.nome,
      termos: [t.nome, t.descricao, ...t.campos.map((c) => c.nome)],
    })),
  },
  {
    id: "constantes",
    titulo: "Constantes",
    itens: r.constantes.map((c) => ({ id: `constante-${c.nome}`, titulo: c.nome, termos: [c.nome, c.descricao] })),
  },
  { id: "ciclo-de-vida", titulo: "Ciclo de vida", itens: [] },
  { id: "eventos", titulo: "Eventos", itens: [] },
  { id: "erros", titulo: "Erros e códigos", itens: [] },
  { id: "limites", titulo: "Limites", itens: [] },
];

/** Uma seção entra na busca pelo título (com todos os itens) ou pelos itens que batem. */
const filterSecao = (secao: TSecaoDoIndice, busca: string): TSecaoDoIndice | null => {
  if (isItemDaBusca([secao.titulo], busca)) return secao;
  const itens = secao.itens.filter((item) => isItemDaBusca(item.termos, busca));
  return itens.length > 0 ? { ...secao, itens } : null;
};

export const buildIndice = (r: TReferencia, busca: string): TSecaoDoIndice[] =>
  buildSecoes(r)
    .map((secao) => filterSecao(secao, busca))
    .filter((secao): secao is TSecaoDoIndice => secao !== null);
