/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Só tokens do design system: a paleta padrão do Tailwind (indigo, green,
// amber...) é desligada em `@plane/tailwind-config` (`--color-*: initial`) e
// não gera CSS. Com `bg-indigo-600` a bolha do atendente ficava transparente
// com texto branco, e as etiquetas de status perdiam o fundo.
export const BOLHA_DA_MENSAGEM = {
  atendente: "rounded-br-sm border border-accent-strong bg-accent-primary text-on-color",
  cliente: "rounded-bl-sm border border-subtle bg-surface-1 text-primary",
} as const;

/** Visto duplo de mensagem lida pelo cliente. */
export const COR_DE_LIDA = "text-accent-primary";

/** Fundo da inicial no avatar (a letra é `text-on-color`). */
export const CORES_DO_AVATAR = [
  "bg-label-indigo-bg-strong",
  "bg-label-emerald-bg-strong",
  "bg-label-crimson-bg-strong",
  "bg-accent-primary",
  "bg-label-grey-bg-strong",
] as const;

const ROTULO_DO_STATUS: Record<string, string> = {
  active: "Ativo",
  paused: "Em pausa",
  queued: "Na fila",
  bot: "Bot",
  closed: "Encerrado",
};

export const COR_DO_STATUS: Record<string, string> = {
  active: "bg-success-subtle text-success-primary",
  paused: "bg-warning-subtle text-warning-primary",
  queued: "bg-warning-subtle text-warning-primary",
  bot: "bg-accent-subtle text-accent-primary",
  closed: "bg-layer-2 text-tertiary",
};

const COR_DE_STATUS_DESCONHECIDO = "bg-layer-2 text-secondary";

/** Etiquetas ao lado do nome do cliente no cabeçalho da conversa. */
export const ETIQUETA_DO_CABECALHO = {
  whatsapp: "bg-success-subtle text-success-primary",
  sistema: "bg-accent-subtle text-accent-primary",
  digitando: "text-success-primary",
} as const;

/** Botões do cabeçalho da conversa. */
export const TOM_DO_BOTAO = {
  principal: "border border-accent-strong bg-accent-primary text-on-color hover:bg-accent-primary-hover",
  neutro: "border border-subtle text-secondary hover:bg-layer-1",
  perigo: "border border-danger-strong text-danger-primary hover:bg-danger-subtle",
} as const;

export type TomDoBotao = keyof typeof TOM_DO_BOTAO;

/** Faixa "Aguardando atendente" da conversa na fila. */
export const FAIXA_DA_FILA = {
  faixa: "border-warning-subtle bg-warning-subtle",
  texto: "text-warning-primary",
  dica: "text-warning-secondary",
  botao: "bg-warning-primary text-on-color hover:opacity-90",
} as const;

/** Estrela preenchida da avaliação do cliente. */
export const COR_DA_ESTRELA = "fill-current text-warning-primary";

/** Ícone de ligação atendida (a perdida usa `text-danger-primary`). */
export const COR_DE_LIGACAO_ATENDIDA = "text-success-primary";

/** Contador de mensagens não lidas e selo "Novo" na lista. */
export const COR_DO_CONTADOR = "bg-danger-primary text-on-color";

export const findClasseDaBolha = (sender: string): string =>
  sender === "attendant" ? BOLHA_DA_MENSAGEM.atendente : BOLHA_DA_MENSAGEM.cliente;

export const findRotuloDoStatus = (status: string): string => ROTULO_DO_STATUS[status] ?? status;

export const findCorDoStatus = (status: string): string => COR_DO_STATUS[status] ?? COR_DE_STATUS_DESCONHECIDO;

export const findCorDoAvatar = (texto: string): string => {
  const hash = [...texto].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return CORES_DO_AVATAR[hash % CORES_DO_AVATAR.length];
};
