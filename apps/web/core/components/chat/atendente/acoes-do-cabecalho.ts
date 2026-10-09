/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isLigacao } from "@/components/chat/ligacoes/ligacao-helpers";
import type { PermissoesDoAtendimento } from "@/components/chat/permissoes-do-atendimento";

/** Ações do cabeçalho da conversa, na ordem em que aparecem. */
export const ACOES_DA_CONVERSA = ["assumir", "link", "chamado", "pausar", "alerta", "transferir", "encerrar"] as const;

export type AcaoDaConversa = (typeof ACOES_DA_CONVERSA)[number];

type PermissoesDoCabecalho = Pick<
  PermissoesDoAtendimento,
  "canAbrirChamado" | "canPausar" | "canTransferir" | "canEncerrar"
>;

export type SessaoDoCabecalho = { status: string; channel: string; issue_label?: string | null };

/** Já tem dono (ou acabou): não há o que assumir. */
const STATUS_WITHOUT_ASSUMIR = new Set(["active", "paused", "closed"]);
const STATUS_EM_ATENDIMENTO = new Set(["active", "paused"]);
const STATUS_WITHOUT_TRANSFERIR = new Set(["closed", "bot"]);

// Ligação do PBX tem painel próprio (assumir, concluir, chamado): no cabeçalho
// ficam só o link e a transferência.
const IS_DISPONIVEL: Record<AcaoDaConversa, (s: SessaoDoCabecalho, p: PermissoesDoCabecalho) => boolean> = {
  assumir: (s) => !isLigacao(s) && !STATUS_WITHOUT_ASSUMIR.has(s.status),
  link: () => true,
  chamado: (s, p) => !isLigacao(s) && (Boolean(s.issue_label) || p.canAbrirChamado),
  pausar: (s, p) => !isLigacao(s) && p.canPausar && STATUS_EM_ATENDIMENTO.has(s.status),
  alerta: (s) => !isLigacao(s) && s.status === "active",
  transferir: (s, p) => p.canTransferir && !STATUS_WITHOUT_TRANSFERIR.has(s.status),
  encerrar: (s, p) => !isLigacao(s) && p.canEncerrar && STATUS_EM_ATENDIMENTO.has(s.status),
};

export const findAcoesDaConversa = (
  sessao: SessaoDoCabecalho,
  permissoes: PermissoesDoCabecalho
): readonly AcaoDaConversa[] => ACOES_DA_CONVERSA.filter((acao) => IS_DISPONIVEL[acao](sessao, permissoes));

/** Ficam à vista enquanto houver espaço; o resto vai para o menu "Mais". */
export const ACOES_PRINCIPAIS: readonly AcaoDaConversa[] = ["assumir", "chamado", "encerrar"];

// Largura útil do CABEÇALHO (não da janela): em 1366 px, com a barra do app
// (250 px) e os dois painéis laterais, sobram uns 500 px. Todas as ações
// ativas com rótulo pedem ~560 px além do nome do cliente; só as principais
// com rótulo, ~220 px.
export const LARGURA_COMPLETA = 900;
export const LARGURA_COM_ROTULO = 480;

export type LayoutDoCabecalho = {
  visiveis: AcaoDaConversa[];
  noMenu: AcaoDaConversa[];
  isOnlyIcone: boolean;
};

const isPrincipal = (acao: AcaoDaConversa) => ACOES_PRINCIPAIS.includes(acao);

const buildCompleto = (acoes: readonly AcaoDaConversa[]): LayoutDoCabecalho => ({
  visiveis: [...acoes],
  noMenu: [],
  isOnlyIcone: false,
});

const buildCompacto =
  (isOnlyIcone: boolean) =>
  (acoes: readonly AcaoDaConversa[]): LayoutDoCabecalho => ({
    visiveis: acoes.filter(isPrincipal),
    noMenu: acoes.filter((acao) => !isPrincipal(acao)),
    isOnlyIcone,
  });

const FAIXAS_DE_LARGURA = [
  { minimo: LARGURA_COMPLETA, build: buildCompleto },
  { minimo: LARGURA_COM_ROTULO, build: buildCompacto(false) },
  { minimo: 0, build: buildCompacto(true) },
] as const;

export const splitAcoesPorLargura = (acoes: readonly AcaoDaConversa[], largura: number): LayoutDoCabecalho => {
  const faixa = FAIXAS_DE_LARGURA.find(({ minimo }) => largura >= minimo) ?? FAIXAS_DE_LARGURA[2];
  return faixa.build(acoes);
};
