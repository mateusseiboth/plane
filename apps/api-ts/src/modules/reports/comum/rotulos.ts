/** Rótulos de prioridade e de grupo de etapa usados pelos relatórios. */
import { ROTULO_DE_PRIORIDADE } from "@utils/prioridade";

// Os rótulos são os mesmos do resto do sistema (@utils/prioridade); só a
// ausência muda de nome: numa legenda de relatório "Sem prioridade" diz mais
// que o "Nenhum" do seletor.
export const PRIORITY_LABELS: Record<string, string> = { ...ROTULO_DE_PRIORIDADE, none: "Sem prioridade" };

export const GROUP_LABELS: Record<string, string> = {
  triage: "Triagem",
  backlog: "Backlog",
  unstarted: "Não iniciado",
  started: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};
