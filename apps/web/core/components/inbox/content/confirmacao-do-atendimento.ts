/**
 * Depois que a Qualidade conclui o chamado, o atendimento diz se o cliente foi
 * atendido (Atendido) ou não (Não atendido, volta para a triagem). Mesma regra
 * do servidor: `apps/api-ts/src/modules/solicitacao/atendimento-da-solicitacao.rules.ts`.
 */
const STATUS_ACEITA = 1;

type TConfirmacao = {
  status: number | undefined;
  grupo: string | undefined;
  isQuemAbriu: boolean;
  can: (acao: string) => boolean;
};

export const isConfirmacaoDoAtendimento = ({ status, grupo, isQuemAbriu, can }: TConfirmacao): boolean =>
  status === STATUS_ACEITA && grupo === "completed" && (isQuemAbriu || can("intake.create") || can("intake.review"));
