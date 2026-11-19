/**
 * O que a tela mostra depois de abrir a solicitação: o número que o atendimento
 * copia e passa ao cliente (o anual, N-AAAA, como no legado) e o do sistema.
 * Antes o aviso era um toast pequeno, sem número, igual para cliente parado.
 */

import { formatNumeroNoSistema } from "@/helpers/numero-no-sistema.helper";

export type SolicitacaoAberta = {
  ticket_number?: string | null;
  label?: string | null;
  project_name?: string | null;
};

export type ConfirmacaoDaSolicitacao = {
  numeroParaOCliente: string;
  numeroNoSistema: string | null;
  aviso: string;
};

const AVISO_NORMAL = "Ela está na triagem do sistema.";
const AVISO_CLIENTE_PARADO = "Cliente parado. O Setor de Qualidade foi comunicado sobre a situação, com prioridade urgente.";

export const buildConfirmacaoDaSolicitacao = (
  aberta: SolicitacaoAberta,
  isClienteParado: boolean
): ConfirmacaoDaSolicitacao => ({
  numeroParaOCliente: aberta.ticket_number || aberta.label || "",
  numeroNoSistema: aberta.ticket_number ? formatNumeroNoSistema({ name: aberta.project_name }, aberta.label) : null,
  aviso: isClienteParado ? AVISO_CLIENTE_PARADO : AVISO_NORMAL,
});
