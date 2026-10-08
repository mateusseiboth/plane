/**
 * Service da movimentação do chamado: aplica a regra do comentário antes de
 * mudar a etapa (`movimentacao.rules.ts`) a um ou vários chamados. Quem chama
 * passa só os chamados que de fato TROCAM de etapa.
 *
 * A recusa sai como erro do campo `state_id`: o tratador global devolve
 * `{ detail, errors: [{ path, message }] }` e a tela mostra junto do seletor.
 */
import type { Credencial } from "@middleware/auth";
import { findMarcosDaMovimentacao } from "@modules/issue/movimentacao.dao";
import {
  MENSAGEM_COMENTE_ANTES_DE_MOVER,
  isComentarioExigido,
  isMovimentacaoLiberada,
  type MarcosDaMovimentacao,
} from "@modules/issue/movimentacao.rules";
import { createFieldError } from "@utils/field-error";

export type MovimentacaoDeps = {
  findMarcos: (issueId: string, userId: string) => Promise<MarcosDaMovimentacao | null>;
};

export type PedidoDeMovimentacao = { issueIds: string[]; userId: string; credencial: Credencial };

export function createMovimentacaoService(deps: MovimentacaoDeps = { findMarcos: findMarcosDaMovimentacao }) {
  const isLiberado = async (issueId: string, userId: string) => {
    const marcos = await deps.findMarcos(issueId, userId);
    return !marcos || isMovimentacaoLiberada(marcos);
  };

  return {
    async requireComentarioAntesDeMover({ issueIds, userId, credencial }: PedidoDeMovimentacao): Promise<void> {
      if (!isComentarioExigido(credencial) || !issueIds.length) return;
      const liberados = await Promise.all(issueIds.map((issueId) => isLiberado(issueId, userId)));
      if (liberados.every(Boolean)) return;
      throw createFieldError("state_id", MENSAGEM_COMENTE_ANTES_DE_MOVER);
    },
  };
}

export const movimentacaoService = createMovimentacaoService();
