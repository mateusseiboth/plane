/**
 * Histórico e encerramento para a impressão do chamado.
 *
 * Os rótulos espelham `describeAtividade` do api-ts
 * (`apps/api-ts/src/modules/reports/log-chamados/log-chamados.ts`): o api-ts não
 * depende dos pacotes `@plane/*`, então não há onde pôr uma fonte única. Campo
 * novo na trilha entra nos dois mapas.
 */
import type { TIssueActivity } from "@plane/types";

const ROTULO_DO_CAMPO: Record<string, string> = {
  issue: "Criou o chamado",
  state: "Mudou a etapa",
  priority: "Mudou a prioridade",
  assignees: "Mudou os responsáveis",
  labels: "Mudou as etiquetas",
  name: "Mudou o título",
  description: "Mudou a descrição",
  target_date: "Mudou o prazo",
  start_date: "Mudou a data de início",
  parent: "Mudou o chamado pai",
  estimate_point: "Mudou a estimativa",
  intake_replica: "Replicou a solicitação",
};

/** Campos cujo valor é texto curto e cabe na impressão (descrição e datas ficam de fora). */
const CAMPOS_COM_VALOR = new Set(["state", "priority", "name", "parent", "estimate_point"]);

type TAtividade = Pick<TIssueActivity, "id" | "verb" | "field" | "old_value" | "new_value" | "created_at"> & {
  actor_detail?: { display_name?: string } | null;
};

const byData = (a: TAtividade, b: TAtividade) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

const readDetalhe = (a: TAtividade) =>
  CAMPOS_COM_VALOR.has(a.field ?? "") ? `${a.old_value || "—"} → ${a.new_value || "—"}` : "";

export function buildHistoricoDoChamado(atividades: TAtividade[]) {
  return [...atividades].sort(byData).map((a) => ({
    id: a.id,
    em: a.created_at,
    autor: a.actor_detail?.display_name ?? "—",
    acao: ROTULO_DO_CAMPO[a.field ?? ""] ?? `Alterou ${a.field ?? "o chamado"}`,
    detalhe: readDetalhe(a),
  }));
}

const GRUPOS_ENCERRADOS = new Set(["completed", "cancelled"]);

/**
 * Encerramento: a última entrada na etapa encerrada em que o chamado está. A tela
 * não grava `completed_at` ao concluir; ele só existe nos chamados migrados.
 */
export function readEncerramento(
  atividades: TAtividade[],
  etapaAtual: { name: string; group: string } | undefined,
  concluidoEm: string | null | undefined
) {
  if (!etapaAtual || !GRUPOS_ENCERRADOS.has(etapaAtual.group)) return null;
  const entrada = atividades
    .filter((a) => a.field === "state" && a.new_value === etapaAtual.name)
    .sort(byData)
    .at(-1);
  if (entrada)
    return { em: entrada.created_at, por: entrada.actor_detail?.display_name ?? null, etapa: etapaAtual.name };
  return concluidoEm ? { em: concluidoEm, por: null, etapa: etapaAtual.name } : null;
}
