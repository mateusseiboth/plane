/**
 * Quem diz se o cliente foi atendido, depois que a Qualidade concluiu o chamado
 * (testes da nova intranet 3, 19/11/2026): Atendido fecha a solicitação; Não
 * atendido, com motivo, devolve o chamado para a triagem. Regras puras, sem
 * banco; quem aplica é `nao-atendido.service.ts` e o PATCH da triagem.
 */
import { escapeHtml } from "@utils/email-template";
import { createFieldError } from "@utils/field-error";
import { EProjectAction, roleCan, type EffectiveRole } from "@utils/permissions";

export const STATUS_ACEITA = 1;
export const STATUS_PENDENTE = -2;

/** Quem abriu, quem abre solicitações (o Atendimento todo) ou quem tria. */
export const isQuemConfirmaAtendimento = ({ isQuemAbriu, role }: { isQuemAbriu: boolean; role: EffectiveRole }) =>
  isQuemAbriu || roleCan(role, EProjectAction.INTAKE_CREATE) || roleCan(role, EProjectAction.INTAKE_REVIEW);

export const MENSAGEM_SEM_PERMISSAO = "Sua função não permite dizer se a solicitação foi atendida.";
export const MENSAGEM_NAO_CONCLUIDO = "O chamado precisa estar Concluído antes de dizer se foi atendido.";

/** Só a solicitação aceita cujo chamado foi concluído espera a confirmação. */
export const isAguardandoConfirmacao = ({ status, grupoDaEtapa }: { status: number; grupoDaEtapa: string | null }) =>
  status === STATUS_ACEITA && grupoDaEtapa === "completed";

export const MINIMO_DO_MOTIVO = 10;
export const MENSAGEM_SEM_MOTIVO = `Escreva o que faltou com pelo menos ${MINIMO_DO_MOTIVO} caracteres.`;

/** O motivo do Não atendido, sem espaços nas pontas; curto demais volta para o campo `motivo`. */
export const readMotivoDoNaoAtendido = (corpo: { motivo?: unknown }): string => {
  const motivo = typeof corpo.motivo === "string" ? corpo.motivo.trim() : "";
  if (motivo.length < MINIMO_DO_MOTIVO) throw createFieldError("motivo", MENSAGEM_SEM_MOTIVO);
  return motivo;
};

/** O comentário que fica no chamado: a Qualidade lê o que faltou ao reabrir a triagem. */
export const buildComentarioDoNaoAtendido = (motivo: string): { html: string; texto: string } => ({
  html: `<p><strong>Não atendido: voltou para a triagem.</strong></p><p>${escapeHtml(motivo).replace(/\n/g, "<br />")}</p>`,
  texto: `Não atendido: voltou para a triagem. ${motivo}`,
});
