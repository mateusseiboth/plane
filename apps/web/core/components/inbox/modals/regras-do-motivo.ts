/**
 * O motivo obrigatório das decisões sobre a solicitação (recusa, não atendido),
 * sem React. O servidor exige o mesmo mínimo e devolve o erro no campo
 * `motivo`; a tela mostra lá.
 */

export const MINIMO_DO_MOTIVO = 10;

type RespostaDoServidor = { detail?: string; errors?: { path: string; message: string }[] } | undefined;

export type RegrasDoMotivo = {
  /** O que falta no motivo, ou `undefined` quando ele já serve. */
  findPendencia: (motivo: string) => string | undefined;
  /** A mensagem que a tela põe no campo quando o servidor recusa. */
  readErro: (erro: RespostaDoServidor) => string;
};

export const createRegrasDoMotivo = (mensagens: { semMotivo: string; falha: string }): RegrasDoMotivo => ({
  findPendencia: (motivo) => (motivo.trim().length < MINIMO_DO_MOTIVO ? mensagens.semMotivo : undefined),
  readErro: (erro) => erro?.errors?.find((e) => e.path === "motivo")?.message ?? erro?.detail ?? mensagens.falha,
});

export const REGRAS_DA_RECUSA = createRegrasDoMotivo({
  semMotivo: `Escreva o motivo da recusa com pelo menos ${MINIMO_DO_MOTIVO} caracteres.`,
  falha: "Não foi possível recusar. Tente de novo.",
});

export const REGRAS_DO_NAO_ATENDIDO = createRegrasDoMotivo({
  semMotivo: `Escreva o que faltou com pelo menos ${MINIMO_DO_MOTIVO} caracteres.`,
  falha: "Não foi possível devolver para a triagem. Tente de novo.",
});
