/**
 * Etapa "No atendimento" (testes da nova intranet 3, 19/11/2026): a solicitação
 * do portal e a criada a partir da ouvidoria nascem com o Atendimento, antes da
 * triagem da Qualidade. Regras puras; quem aplica é `no-atendimento.service.ts`.
 */
import { createFieldError } from "@utils/field-error";
import { EProjectAction, roleCan, type EffectiveRole } from "@utils/permissions";
import type { RespostaEscrita } from "@modules/portal/resposta";
import { limparTextoDoCliente, textoSemMarcacao } from "@modules/portal/texto-rico";

/** `intake_issues.status` da etapa: abaixo do pendente (-2), fora da fila da triagem. */
export const STATUS_NO_ATENDIMENTO = -3;

/** Encaminha ou encerra quem abre solicitações (o Atendimento) ou quem tria. */
export const isQuemDecideNoAtendimento = (role: EffectiveRole): boolean =>
  roleCan(role, EProjectAction.INTAKE_CREATE) || roleCan(role, EProjectAction.INTAKE_REVIEW);

export const MENSAGEM_SEM_PERMISSAO = "Sua função não permite decidir a solicitação no atendimento.";
export const MENSAGEM_FORA_DO_ATENDIMENTO = "Esta solicitação não está mais no atendimento.";

export const MINIMO_DA_RESPOSTA = 10;
export const MENSAGEM_SEM_RESPOSTA = `Escreva a resposta ao cliente com pelo menos ${MINIMO_DA_RESPOSTA} caracteres.`;

/** A resposta do encerramento, limpa pela lista de permissão do portal; curta volta para o campo. */
export const readRespostaDoEncerramento = (corpo: { resposta_html?: unknown }): RespostaEscrita => {
  const html = limparTextoDoCliente(corpo.resposta_html);
  const texto = textoSemMarcacao(html);
  if (texto.length < MINIMO_DA_RESPOSTA) throw createFieldError("resposta_html", MENSAGEM_SEM_RESPOSTA);
  return { html, texto };
};
