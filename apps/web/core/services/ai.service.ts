/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// helpers
import { API_BASE_URL } from "@plane/constants";
// plane web constants
import type { AI_EDITOR_TASKS } from "@/constants/ai";
// services
import { APIService } from "@/services/api.service";
// types
// FIXME:
// import { IGptResponse } from "@plane/types";
// helpers

export type TTaskPayload = {
  casual_score?: number;
  formal_score?: number;
  task: AI_EDITOR_TASKS;
  text_input: string;
};

/** O que a tela sabe do chamado e manda junto para a IA se situar. */
export type TContextoDaMelhoria = {
  issue_title?: string;
  project_name?: string;
  status?: string;
  priority?: string;
  assignees?: string[];
  previous_comments?: string[];
};

/** Onde o botão está: dá ao servidor o contexto do banco e a permissão. */
export type TAlvoDaMelhoria = {
  campo?: "descricao" | "comentario";
  project_id?: string;
  issue_id?: string;
};

/**
 * As suspeitas da guarda do servidor — Parte 3 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`. Elas **informam, não vetam**: a proposta
 * chega inteira e é o autor quem decide. "A IA pode ter perdido 4.2.1" é o que
 * permite decidir; um aviso genérico não seria.
 */
export type TAvisosDeMelhoria = {
  /** Trechos do original que podem não ter sobrevivido à reescrita. */
  perdidos: string[];
  /** Dados que só aparecem na proposta. */
  inventados: string[];
};

/** A nota do checklist antes e depois. Referência para escolher, não veredito. */
export type TAceitacaoDaMelhoria = {
  antes: number;
  depois: number;
};

export type TMelhoriaDeTexto = {
  /** O HTML que saiu do editor, como o servidor o recebeu. */
  original: string;
  /** A proposta da IA. Vazia quando o modelo não produziu nada. */
  proposta: string;
  /**
   * Por que não houve proposta, nas palavras do servidor — ele é quem sabe se a
   * IA calou ou se devolveu o texto igual. `null` quando houve proposta.
   */
  motivo: string | null;
  /** `null` quando o provedor não sabe dizer — e aí a tela não reserva espaço. */
  avisos: TAvisosDeMelhoria | null;
  aceitacao: TAceitacaoDaMelhoria | null;
};

const comoObjeto = (valor: unknown): Record<string, unknown> =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

const comoTexto = (valor: unknown): string => (typeof valor === "string" ? valor : "");

const comoListaDeTextos = (valor: unknown): string[] =>
  Array.isArray(valor)
    ? valor.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

/**
 * `Number(null)` e `Number("")` valem zero: sem conferir o tipo antes, "não veio
 * nota" viraria "nota zero" — e zero é uma acusação, não uma ausência.
 */
const comoNota = (valor: unknown): number | null => {
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  const bruto = Number(valor);
  if (!Number.isFinite(bruto)) return null;
  return Math.min(Math.max(Math.round(bruto), 0), 100);
};

/** Sem nenhuma suspeita a lista não existe: nada de bloco vazio na tela. */
const lerAvisos = (corpo: Record<string, unknown>): TAvisosDeMelhoria | null => {
  const bruto = comoObjeto(corpo.avisos);
  const perdidos = comoListaDeTextos(bruto.perdidos);
  const inventados = comoListaDeTextos(bruto.inventados);
  if (perdidos.length === 0 && inventados.length === 0) return null;
  return { perdidos, inventados };
};

/** Uma nota só, sem a outra, não é comparação — e comparação é o que se mostra. */
const lerAceitacao = (corpo: Record<string, unknown>): TAceitacaoDaMelhoria | null => {
  const bruto = comoObjeto(corpo.aceitacao);
  const antes = comoNota(bruto.antes);
  const depois = comoNota(bruto.depois);
  if (antes === null || depois === null) return null;
  return { antes, depois };
};

/**
 * `mudou: false` é o caso honesto de o modelo não ter produzido nada, e manda
 * no que vier junto: proposta vazia é o que a tela precisa saber para dizer a
 * verdade em vez de anunciar uma atualização que não houve.
 */
const lerProposta = (corpo: Record<string, unknown>): string => {
  if (corpo.mudou === false) return "";
  return comoTexto(corpo.response) || comoTexto(corpo.texto);
};

const normalizarMelhoria = (dados: unknown, enviado: string): TMelhoriaDeTexto => {
  const corpo = comoObjeto(dados);
  return {
    original: comoTexto(corpo.original) || enviado,
    proposta: lerProposta(corpo),
    motivo: comoTexto(corpo.detail).trim() || null,
    avisos: lerAvisos(corpo),
    aceitacao: lerAceitacao(corpo),
  };
};

/** A IA não produziu proposta nenhuma. */
export const semProposta = (melhoria: TMelhoriaDeTexto): boolean => melhoria.proposta.trim().length === 0;

/** Produziu, e é o mesmo texto — o defeito que originou a comparação lado a lado. */
export const propostaIdentica = (melhoria: TMelhoriaDeTexto): boolean =>
  melhoria.proposta.trim() === melhoria.original.trim();

export class AIService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async createGptTask(workspaceSlug: string, data: { prompt: string; task: string }): Promise<any> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-assistant/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async performEditorTask(
    workspaceSlug: string,
    data: TTaskPayload
  ): Promise<{
    response: string;
  }> {
    return this.post(`/api/workspaces/${workspaceSlug}/rephrase-grammar/`, data)
      .then((res) => res?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  /**
   * Pede a proposta da IA para o texto que está no editor.
   *
   * **Não substitui nada**: devolve o original e a proposta lado a lado, com as
   * suspeitas da guarda e a nota antes/depois quando o provedor souber dizer.
   * Quem decide é o autor, na comparação — a rota só propõe.
   */
  async improveText(
    workspaceSlug: string,
    content: string,
    context?: TContextoDaMelhoria,
    // Com os ids o servidor monta o contexto do banco (inclusive anexos) e
    // confere a permissão do projeto; sem eles, sobra só o que a tela sabe.
    alvo?: TAlvoDaMelhoria
  ): Promise<TMelhoriaDeTexto> {
    return this.post(`/api/workspaces/${workspaceSlug}/ai-assistant/improve-text/`, {
      content,
      context,
      ...alvo,
    })
      .then((res) => normalizarMelhoria(res?.data, content))
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
