/**
 * Corpo do rascunho do espaço de trabalho. O formulário de chamado manda
 * snake_case (`state_id`, `start_date`); a rota lia só `state` e descartava a
 * etapa e as datas escolhidas na tela.
 */
import { inicioRecebido, vencimentoRecebido } from "@utils/prazo";

type DraftData = Record<string, unknown>;

/** Campo do corpo → coluna do Prisma. Etapa vazia vira null, nunca uuid inválido. */
const CAMPOS_DO_RASCUNHO: Record<string, (valor: any) => DraftData> = {
  name: (valor) => ({ name: valor }),
  priority: (valor) => ({ priority: valor }),
  project_id: (valor) => ({ projectId: valor }),
  state: (valor) => ({ stateId: valor || null }),
  state_id: (valor) => ({ stateId: valor || null }),
  description_html: (valor) => ({ descriptionHtml: valor }),
  start_date: (valor) => ({ startDate: inicioRecebido(valor) }),
  target_date: (valor) => ({ targetDate: vencimentoRecebido(valor) }),
};

export function buildDraftData(corpo: Record<string, unknown>): DraftData {
  const enviados = Object.entries(CAMPOS_DO_RASCUNHO).filter(([campo]) => corpo[campo] !== undefined);
  return Object.assign({}, ...enviados.map(([campo, traduzir]) => traduzir(corpo[campo])));
}
