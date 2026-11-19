/**
 * A solicitação que nasceu com o Atendimento (portal, ouvidoria) espera ele
 * encaminhar para a triagem ou encerrar ali. Mesma regra do servidor:
 * `apps/api-ts/src/modules/solicitacao/no-atendimento.rules.ts`.
 */
export const STATUS_NO_ATENDIMENTO = -3;

type TDecisao = { status: number | undefined; can: (acao: string) => boolean };

export const isDecisaoNoAtendimento = ({ status, can }: TDecisao): boolean =>
  status === STATUS_NO_ATENDIMENTO && (can("intake.create") || can("intake.review"));
