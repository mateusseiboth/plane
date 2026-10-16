/**
 * Quem aceita, recusa ou marca como duplicada uma solicitação da triagem.
 *
 * A resposta vem da matriz de ações (`intake.review`), a mesma que o servidor
 * confere no PATCH da solicitação: a tela não decide por nível de papel.
 */

/** Pendente (-2) e adiada (0) ainda esperam triagem. */
export const STATUS_QUE_AGUARDAM_TRIAGEM = [-2, 0] as const;

export const ACAO_DE_TRIAGEM = "intake.review";

type Pergunta = { can: (acao: string) => boolean; status: number | undefined };

export const isTriagemPermitida = ({ can, status }: Pergunta): boolean =>
  status !== undefined && (STATUS_QUE_AGUARDAM_TRIAGEM as readonly number[]).includes(status) && can(ACAO_DE_TRIAGEM);
