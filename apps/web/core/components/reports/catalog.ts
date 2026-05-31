/**
 * Catálogo de relatórios gerenciais.
 * Cada item descreve um relatório disponível em /:workspaceSlug/reports/:reportId.
 * `id` casa com o segmento da rota e com o método do ReportsService / endpoint do backend.
 */

export type ReportCategory = "chamados" | "pessoas" | "visitas" | "gerencial";

export type ReportMeta = {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  /** lucide icon name (resolvido no componente) */
  icon: string;
  /** filtros aplicáveis a este relatório */
  filters: ("period" | "project" | "entity")[];
};

export const REPORT_CATEGORIES: { key: ReportCategory; label: string; description: string }[] = [
  { key: "chamados", label: "Chamados", description: "Volume, distribuição e desempenho dos chamados" },
  { key: "pessoas", label: "Produtividade & Pessoas", description: "Desempenho de técnicos, tempo gasto e interações" },
  { key: "visitas", label: "Visitas Técnicas", description: "Visitas por status, motivo, técnico e entidade" },
  { key: "gerencial", label: "Gerencial & Temporal", description: "Visões executivas, tendências e SLA" },
];

export const REPORTS: ReportMeta[] = [
  {
    id: "tickets-overview",
    title: "Visão Geral de Chamados",
    description: "KPIs gerais, taxa de conclusão, tempo médio de resolução e distribuição por prioridade e status.",
    category: "chamados",
    icon: "LayoutDashboard",
    filters: ["period", "project", "entity"],
  },
  {
    id: "by-system",
    title: "Chamados por Sistema",
    description: "Ranking de sistemas com mais chamados, % do total, abertos vs concluídos e tempo médio.",
    category: "chamados",
    icon: "MonitorSmartphone",
    filters: ["period", "entity"],
  },
  {
    id: "by-entity",
    title: "Chamados por Entidade",
    description: "Ranking de clientes/entidades, volume, prioridade e tempo médio de resolução.",
    category: "chamados",
    icon: "Building2",
    filters: ["period", "project"],
  },
  {
    id: "by-priority",
    title: "Chamados por Prioridade",
    description: "Distribuição por urgência, tempo de resolução por prioridade e lista crítica de urgentes em aberto.",
    category: "chamados",
    icon: "Flame",
    filters: ["period", "project", "entity"],
  },
  {
    id: "by-type",
    title: "Chamados por Tipo de Atividade",
    description: "Correção, melhoria, projeto e dúvida (via etiquetas): volume e tempo médio por tipo.",
    category: "chamados",
    icon: "Tags",
    filters: ["period", "project", "entity"],
  },
  {
    id: "productivity",
    title: "Produtividade por Técnico",
    description: "Chamados atribuídos, resolvidos, taxa de resolução, tempo registrado e interações por responsável.",
    category: "pessoas",
    icon: "Users",
    filters: ["period", "project", "entity"],
  },
  {
    id: "time-tracking",
    title: "Tempo Gasto",
    description: "Horas registradas por usuário, sistema e os chamados que mais consumiram tempo.",
    category: "pessoas",
    icon: "Clock",
    filters: ["period", "project", "entity"],
  },
  {
    id: "interactions",
    title: "Interações / Mensagens",
    description: "Total de interações, média por chamado e chamados com mais mensagens (possíveis gargalos).",
    category: "pessoas",
    icon: "MessagesSquare",
    filters: ["period", "project", "entity"],
  },
  {
    id: "visits-overview",
    title: "Visão Geral de Visitas",
    description: "Visitas por status, motivo, técnico, entidade e cidade, com duração média.",
    category: "visitas",
    icon: "Wrench",
    filters: ["period", "entity"],
  },
  {
    id: "trends",
    title: "Tendência Temporal",
    description: "Chamados criados vs concluídos por mês (últimos 12 meses) e evolução do backlog.",
    category: "gerencial",
    icon: "TrendingUp",
    filters: ["project", "entity"],
  },
  {
    id: "backlog-aging",
    title: "Backlog Aging",
    description: "Chamados abertos por faixa de idade (0-7d, 8-30d, 31-90d, 90+) e os mais antigos.",
    category: "gerencial",
    icon: "Hourglass",
    filters: ["project", "entity"],
  },
  {
    id: "sla",
    title: "SLA / Tempo de Resolução",
    description: "Distribuição dos tempos de resolução, % dentro de 24h/72h e tempo médio por prioridade.",
    category: "gerencial",
    icon: "Timer",
    filters: ["period", "project", "entity"],
  },
  {
    id: "executive",
    title: "Dashboard Executivo",
    description: "Consolidação dos principais indicadores para a gerência: saúde geral, top sistemas e entidades.",
    category: "gerencial",
    icon: "Gauge",
    filters: ["period", "project", "entity"],
  },
];

export function getReportMeta(id: string): ReportMeta | undefined {
  return REPORTS.find((r) => r.id === id);
}
