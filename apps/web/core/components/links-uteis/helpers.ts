/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Montagem do endereço de cada cartão. Puro, para o teste rodar sem navegador.

import type { TCartaoDeLink } from "@/services/links-uteis.service";

/** Caminho do cartão: o pronto da API, ou o montado com o valor escolhido. */
export const readCaminhoDoCartao = (cartao: TCartaoDeLink, valor: string): string => {
  const campo = cartao.campo;
  if (!campo) return cartao.caminho;
  const escolhido = valor.trim();
  if (!escolhido) return "";
  return `${campo.prefixo}${encodeURIComponent(escolhido)}${campo.sufixo}`;
};

/**
 * Endereço que vai para a área de transferência. Nasce da ORIGEM em que a tela
 * está aberta: endereço fixo aqui faria a equipe mandar "localhost" ao cliente.
 */
export const buildEndereco = (origem: string, caminho: string): string =>
  caminho ? `${origem.replace(/\/$/, "")}${caminho}` : "";

/** Valor inicial do campo: a primeira opção quando há lista, senão vazio. */
export const readValorInicial = (cartao: TCartaoDeLink): string => cartao.campo?.opcoes[0]?.valor ?? "";
