/**
 * "Comentar e movimentar": grava o comentário e, só se ele entrou, muda a
 * etapa. O servidor exige comentário depois da última mudança de etapa
 * (`issue.require_comment_to_move`), então a ordem importa.
 */
export type TPassosDaMovimentacao = {
  /** `true` quando o comentário foi gravado. */
  comentar: () => Promise<boolean>;
  mover: (stateId: string) => Promise<void>;
};

export const sendComentarioEMovimentacao = async (
  { comentar, mover }: TPassosDaMovimentacao,
  stateId: string
): Promise<boolean> => {
  if (!(await comentar())) return false;
  try {
    await mover(stateId);
    return true;
  } catch {
    return false;
  }
};
