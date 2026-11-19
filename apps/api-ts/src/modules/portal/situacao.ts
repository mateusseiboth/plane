/**
 * A situação da solicitação, na língua do cliente.
 *
 * O cliente não conhece triagem, duplicidade nem grupo de estado — ele quer
 * saber o que aconteceu com o pedido que abriu. Recusada e duplicada não são
 * estado do chamado: são desfecho da triagem, e por isso vêm ANTES de se olhar
 * o estado (o chamado recusado continua parado num estado qualquer).
 */

/** `status` de `intake_issues`: -3 no atendimento, -2 pendente, 0 adiada, 1 aceita, -1 recusada, 2 duplicada, 3 atendida. */
export type EstadoDoChamado = { name: string; group: string; color: string; isTriage: boolean } | null;

export type Situacao = {
  /** O que aparece na etiqueta. */
  rotulo: string;
  /** Grupo do estado — é ele que escolhe a cor na tela. */
  grupo: string;
};

const EM_TRIAGEM: Situacao = { rotulo: "Em triagem", grupo: "triage" };

/** Desfechos da triagem que não são estado de chamado. */
const DESFECHO_DA_TRIAGEM: Record<number, Situacao> = {
  [-3]: { rotulo: "Em atendimento", grupo: "triage" },
  [-1]: { rotulo: "Recusada", grupo: "cancelled" },
  2: { rotulo: "Duplicada", grupo: "cancelled" },
};

/** Atendida sem sair da triagem: o Atendimento encerrou sem virar chamado. */
const RESOLVIDA_NO_ATENDIMENTO: Situacao = { rotulo: "Resolvida no atendimento", grupo: "completed" };

const isResolvidaNoAtendimento = (intakeStatus: number, estado: EstadoDoChamado) =>
  intakeStatus === 3 && (!estado || estado.isTriage || estado.group === "triage");

export function situacaoDaSolicitacao(entrada: { intakeStatus: number; estado: EstadoDoChamado }): Situacao {
  const desfecho = DESFECHO_DA_TRIAGEM[entrada.intakeStatus];
  if (desfecho) return desfecho;
  if (isResolvidaNoAtendimento(entrada.intakeStatus, entrada.estado)) return RESOLVIDA_NO_ATENDIMENTO;
  const estado = entrada.estado;
  if (!estado || estado.isTriage || estado.group === "triage") return EM_TRIAGEM;
  return { rotulo: estado.name, grupo: estado.group };
}
