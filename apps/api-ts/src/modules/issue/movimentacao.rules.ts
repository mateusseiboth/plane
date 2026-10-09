/**
 * Comentário obrigatório antes de mudar a etapa do chamado. Regra pura, sem
 * banco: os marcos vêm de `movimentacao.dao.ts` e quem aplica é
 * `movimentacao.service.ts`.
 *
 * A pessoa só move o chamado se comentou nele DEPOIS da última mudança de
 * etapa (ou depois da criação, quando ele nunca mudou). Quem só cria o chamado
 * e as movimentações do sistema (aceite na triagem, chat, scripts com chave de
 * API) não passam por aqui.
 *
 * A obrigação é uma ação da matriz de permissões
 * (`issue.require_comment_to_move`): MARCADA na função efetiva da pessoa (com as
 * exceções por pessoa) = precisa comentar; desmarcada = move direto.
 */
import type { Credencial } from "@middleware/auth";
import { EProjectAction, roleCan, type EffectiveRole } from "@utils/permissions";

export const MENSAGEM_COMENTE_ANTES_DE_MOVER = "Comente no chamado antes de mudar a etapa.";

export type MarcosDaMovimentacao = {
  criadoEm: Date;
  ultimaMudancaDeEtapaEm: Date | null;
  ultimoComentarioDoUsuarioEm: Date | null;
};

export function isMovimentacaoLiberada(marcos: MarcosDaMovimentacao): boolean {
  if (!marcos.ultimoComentarioDoUsuarioEm) return false;
  const referencia = marcos.ultimaMudancaDeEtapaEm ?? marcos.criadoEm;
  // Estritamente depois: o comentário que liberou uma mudança não libera a próxima.
  return marcos.ultimoComentarioDoUsuarioEm.getTime() > referencia.getTime();
}

/** Só a pessoa logada precisa comentar; script e integração movem sem comentário. */
const EXIGE_COMENTARIO: Record<Credencial, boolean> = {
  sessao: true,
  "chave-de-api": false,
};

export type QuemMove = { credencial: Credencial; role: EffectiveRole };

export const isComentarioExigido = ({ credencial, role }: QuemMove): boolean =>
  (EXIGE_COMENTARIO[credencial] ?? false) && roleCan(role, EProjectAction.ISSUE_REQUIRE_COMMENT_TO_MOVE);
