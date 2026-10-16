/**
 * Quem registra horas na atividade do chamado.
 *
 * Registrar horas é trabalho sobre o chamado: quem edita qualquer chamado
 * (`issue.edit.all`) registra em todos; quem edita os próprios registra nos
 * chamados em que está atribuído. A tela não decide por nível de papel.
 */
import { isIssueEditAllowed } from "@/lib/permissoes/regras-de-chamado";

type Pergunta = { can: (acao: string) => boolean; isAssigned: boolean; isIntakeIssue: boolean };

export const isWorklogAllowed = ({ can, isAssigned, isIntakeIssue }: Pergunta): boolean =>
  !isIntakeIssue && (can("issue.edit.all") || (isAssigned && isIssueEditAllowed(can)));
