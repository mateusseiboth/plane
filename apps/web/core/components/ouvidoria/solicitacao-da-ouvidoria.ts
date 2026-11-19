/**
 * A solicitação criada a partir de uma ouvidoria, como a tela da ouvidoria a
 * mostra: o processo (criada, encaminhada, etapas, atendida) ou o botão de
 * criar. Regras do servidor em
 * `apps/api-ts/src/modules/ouvidoria/solicitacao-da-ouvidoria.rules.ts`.
 */
export type TEventoDoProcesso = { evento: string; em: string };

export type TSolicitacaoDaOuvidoria = {
  issue_id: string;
  project_id: string;
  numero: string;
  titulo: string;
  situacao: string;
  etapa: string | null;
  atendente: string | null;
  processo: TEventoDoProcesso[];
};

export type TBlocoDaSolicitacao = "processo" | "criar" | "nada";

export const readBlocoDaSolicitacao = ({
  solicitacao,
  canCriar,
}: {
  solicitacao: TSolicitacaoDaOuvidoria | null | undefined;
  canCriar: boolean;
}): TBlocoDaSolicitacao => {
  if (solicitacao) return "processo";
  return canCriar ? "criar" : "nada";
};
