/**
 * Visitas técnicas como o CLIENTE as vê no portal. Puro, sem banco.
 *
 * Paridade com o Service Desk antigo (`service-desk-lista-visitas-tecnicas` e
 * `service-desk-visita-tecnica-relatorio`): três situações, e o relatório em
 * modo leitura. A leitura do banco mora em `visitas-do-cliente.ts`.
 *
 * O ponto de partida é o MESMO serializer da tela interna (`serializeVisit`):
 * aqui só se escolhe o que sai para fora. O que é da equipe (anexos do
 * relatório, anotação de contato, ids de usuário) não aparece.
 */

import { inicioDeHoje } from "@utils/prazo";
import { VISIT_STATUS } from "@modules/technical-visit/visit-status";

export const SITUACOES_DE_VISITA = ["abertas", "efetivadas", "vencidas"] as const;
export type SituacaoDeVisita = (typeof SITUACOES_DE_VISITA)[number];

export function readSituacaoDeVisita(valor: unknown): SituacaoDeVisita {
  return SITUACOES_DE_VISITA.find((s) => s === valor) ?? "abertas";
}

/** Cancelada nunca aparece para o cliente; concluída é "efetivada". */
const ENCERRADAS = [VISIT_STATUS.CONCLUIDA, VISIT_STATUS.CANCELADA];

const FILTRO_POR_SITUACAO: Record<SituacaoDeVisita, (hoje: Date) => Record<string, unknown>> = {
  efetivadas: () => ({ status: VISIT_STATUS.CONCLUIDA }),
  vencidas: (hoje) => ({ status: { notIn: ENCERRADAS }, scheduledDate: { lt: hoje } }),
  abertas: (hoje) => ({
    status: { notIn: ENCERRADAS },
    OR: [{ scheduledDate: null }, { scheduledDate: { gte: hoje } }],
  }),
};

/** Sempre pela entidade da conta: é a única chave que liga o cliente à visita. */
export function buildWhereDasVisitasDoCliente(
  workspaceId: string,
  entityId: string,
  situacao: SituacaoDeVisita,
  agora: Date
) {
  return { workspaceId, entityId, deletedAt: null, ...FILTRO_POR_SITUACAO[situacao](inicioDeHoje(0, agora)) };
}

/**
 * O relatório só sai quando a visita foi fechada. "Relatório em Elaboração" é
 * rascunho da equipe, e o cliente leria um texto que ainda vai mudar.
 */
const COM_RELATORIO: ReadonlySet<number> = new Set([VISIT_STATUS.AGUARDANDO_ASSINATURA, VISIT_STATUS.CONCLUIDA]);

/** Mesmos rótulos e ordem da tela interna (`VISIT_MOTIVOS` do web). */
const MOTIVOS = [
  { campo: "mot_commercial", rotulo: "Comercial" },
  { campo: "mot_update", rotulo: "Atualização" },
  { campo: "mot_bug_fix", rotulo: "Correção de erros" },
  { campo: "mot_training", rotulo: "Acompanhamento ou treinamento" },
  { campo: "mot_improvement", rotulo: "Solicitação de melhoria" },
  { campo: "mot_other", rotulo: "Outros" },
] as const;

type Tecnico = { display_name?: string; first_name?: string; last_name?: string } | null | undefined;

const nomeDoTecnico = (t: Tecnico) => `${t?.first_name ?? ""} ${t?.last_name ?? ""}`.trim() || t?.display_name || "";

function buildMotivos(v: Record<string, any>): string[] {
  return MOTIVOS.filter((m) => v[m.campo]).map((m) =>
    m.campo === "mot_other" && v.mot_other_description ? `${m.rotulo}: ${v.mot_other_description}` : m.rotulo
  );
}

/** A visita serializada pela tela interna, reduzida ao que o cliente pode ler. */
export function buildVisitaDoCliente(v: Record<string, any>) {
  const comRelatorio = COM_RELATORIO.has(v.status);
  return {
    id: v.id,
    numero: v.visit_number ?? null,
    situacao: v.status_label,
    vencida: Boolean(v.is_overdue),
    data_programada: v.scheduled_date ?? null,
    inicio: v.started_at ?? null,
    fim: v.finished_at ?? null,
    periodo: v.period ?? null,
    cidade: v.city ?? null,
    entidade: v.entity?.name ?? null,
    tecnicos: [v.technician, v.technician2].map(nomeDoTecnico).filter(Boolean),
    motivos: buildMotivos(v),
    sistemas: (v.projects ?? []).map((p: { name: string }) => p.name),
    funcionalidades: (v.modules ?? []).map((m: { name: string }) => m.name),
    chamados: (v.issues ?? []).map((i: any) => ({ codigo: i.code, titulo: i.name, situacao: i.state?.name ?? "" })),
    resumo_html: comRelatorio ? (v.summary ?? null) : null,
    conclusao_html: comRelatorio ? (v.conclusion ?? null) : null,
  };
}

export type VisitaDoCliente = ReturnType<typeof buildVisitaDoCliente>;
