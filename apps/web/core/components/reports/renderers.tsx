/**
 * Renderizadores de cada relatório. `ReportRenderer` despacha por reportId.
 * Cada função recebe o payload já carregado da API (ver ReportsService / backend).
 */
import {
  BarList,
  fmtDays,
  fmtHours,
  KpiCard,
  KpiGrid,
  PRIORITY_COLORS,
  CHART_PALETTE,
  ReportTable,
  SectionTitle,
  type BarItem,
  type Column,
} from "./ui";

function ticketRef(row: { legacy_ticket_number?: string | null; sequence_id?: number | null }) {
  if (row.legacy_ticket_number) return row.legacy_ticket_number;
  if (row.sequence_id) return `#${row.sequence_id}`;
  return "—";
}

// ── 1. Visão geral de chamados ──────────────────────────────────────────────
function TicketsOverview({ data }: { data: any }) {
  const k = data.kpis ?? {};
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total de chamados" value={k.total ?? 0} />
        <KpiCard label="Concluídos" value={k.completed ?? 0} accent="green" />
        <KpiCard label="Em andamento" value={k.in_progress ?? 0} accent="blue" />
        <KpiCard label="Pendentes" value={k.pending ?? 0} accent="amber" />
        <KpiCard label="Cancelados" value={k.cancelled ?? 0} accent="red" />
        <KpiCard label="Taxa de conclusão" value={`${k.completion_rate ?? 0}%`} accent="green" />
        <KpiCard label="Tempo médio de resolução" value={fmtDays(k.avg_resolution_days)} hint="dias entre abertura e conclusão" />
      </KpiGrid>

      <SectionTitle>Distribuição por prioridade</SectionTitle>
      <BarList items={(data.by_priority ?? []).map((p: any): BarItem => ({ label: p.label, value: p.count, color: PRIORITY_COLORS[p.key] }))} />

      <SectionTitle>Distribuição por status</SectionTitle>
      <BarList items={(data.by_status ?? []).map((s: any, i: number): BarItem => ({ label: s.label, value: s.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
    </div>
  );
}

// ── 2. Chamados por sistema ─────────────────────────────────────────────────
function BySystem({ data }: { data: any }) {
  const cols: Column<any>[] = [
    { key: "name", header: "Sistema", render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: "total", header: "Total", align: "right" },
    { key: "percentage", header: "% do total", align: "right", render: (r) => `${r.percentage}%` },
    { key: "completed", header: "Concluídos", align: "right" },
    { key: "open", header: "Abertos", align: "right" },
    { key: "avg", header: "Tempo médio", align: "right", render: (r) => fmtDays(r.avg_resolution_days) },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total de chamados" value={data.total ?? 0} />
        <KpiCard label="Sistemas com chamados" value={data.count ?? 0} />
      </KpiGrid>
      <SectionTitle hint="Top 12">Ranking de sistemas</SectionTitle>
      <BarList items={(data.rows ?? []).slice(0, 12).map((r: any, i: number): BarItem => ({ label: r.name, value: r.total, sub: `${r.percentage}%`, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Detalhamento por sistema</SectionTitle>
      <ReportTable columns={cols} rows={data.rows ?? []} />
    </div>
  );
}

// ── 3. Chamados por entidade ────────────────────────────────────────────────
function ByEntity({ data }: { data: any }) {
  const cols: Column<any>[] = [
    { key: "name", header: "Entidade", render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: "city", header: "Cidade/UF", render: (r) => [r.city, r.state].filter(Boolean).join(" / ") || "—" },
    { key: "total", header: "Total", align: "right" },
    { key: "percentage", header: "%", align: "right", render: (r) => `${r.percentage}%` },
    { key: "open", header: "Abertos", align: "right" },
    { key: "high_priority", header: "Urg./Alta", align: "right" },
    { key: "avg", header: "Tempo médio", align: "right", render: (r) => fmtDays(r.avg_resolution_days) },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total de chamados" value={data.total ?? 0} />
        <KpiCard label="Entidades com chamados" value={data.count ?? 0} />
      </KpiGrid>
      <SectionTitle hint="Top 12">Ranking de entidades</SectionTitle>
      <BarList items={(data.rows ?? []).slice(0, 12).map((r: any, i: number): BarItem => ({ label: r.name, value: r.total, sub: `${r.percentage}%`, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Detalhamento por entidade</SectionTitle>
      <ReportTable columns={cols} rows={data.rows ?? []} />
    </div>
  );
}

// ── 4. Chamados por prioridade ──────────────────────────────────────────────
function ByPriority({ data }: { data: any }) {
  const cols: Column<any>[] = [
    { key: "label", header: "Prioridade", render: (r) => <span className="font-medium text-primary">{r.label}</span> },
    { key: "total", header: "Total", align: "right" },
    { key: "completed", header: "Concluídos", align: "right" },
    { key: "open", header: "Abertos", align: "right" },
    { key: "avg", header: "Tempo médio", align: "right", render: (r) => fmtDays(r.avg_resolution_days) },
  ];
  const critCols: Column<any>[] = [
    { key: "ref", header: "Chamado", render: (r) => <span className="font-medium text-primary">{ticketRef(r)}</span> },
    { key: "name", header: "Título", render: (r) => <span className="line-clamp-1">{r.name}</span> },
    { key: "priority_label", header: "Prioridade" },
    { key: "project", header: "Sistema", render: (r) => r.project ?? "—" },
    { key: "entity", header: "Entidade", render: (r) => r.entity ?? "—" },
    { key: "age_days", header: "Idade", align: "right", render: (r) => `${r.age_days} d` },
  ];
  return (
    <div>
      <SectionTitle>Distribuição por prioridade</SectionTitle>
      <BarList items={(data.rows ?? []).map((r: any): BarItem => ({ label: r.label, value: r.total, color: PRIORITY_COLORS[r.key] }))} />
      <SectionTitle>Desempenho por prioridade</SectionTitle>
      <ReportTable columns={cols} rows={data.rows ?? []} />
      <SectionTitle hint="Urgentes/Altas em aberto há mais tempo">⚠ Lista crítica</SectionTitle>
      <ReportTable columns={critCols} rows={data.critical ?? []} emptyLabel="Nenhum chamado crítico em aberto. 🎉" />
    </div>
  );
}

// ── 5. Chamados por tipo de atividade ───────────────────────────────────────
function ByType({ data }: { data: any }) {
  const cols: Column<any>[] = [
    {
      key: "name",
      header: "Tipo / Etiqueta",
      render: (r) => (
        <span className="flex items-center gap-2 font-medium text-primary">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.color }} />
          {r.name}
        </span>
      ),
    },
    { key: "total", header: "Total", align: "right" },
    { key: "completed", header: "Concluídos", align: "right" },
    { key: "open", header: "Abertos", align: "right" },
    { key: "avg", header: "Tempo médio", align: "right", render: (r) => fmtDays(r.avg_resolution_days) },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Chamados analisados" value={data.total_issues ?? 0} />
        <KpiCard label="Sem etiqueta" value={data.untagged ?? 0} accent="amber" />
        <KpiCard label="Tipos distintos" value={(data.rows ?? []).length} />
      </KpiGrid>
      <SectionTitle>Volume por tipo</SectionTitle>
      <BarList items={(data.rows ?? []).slice(0, 14).map((r: any): BarItem => ({ label: r.name, value: r.total, color: r.color }))} />
      <SectionTitle>Detalhamento</SectionTitle>
      <ReportTable columns={cols} rows={data.rows ?? []} />
    </div>
  );
}

// ── 6. Produtividade por técnico ────────────────────────────────────────────
function Productivity({ data }: { data: any }) {
  const cols: Column<any>[] = [
    { key: "name", header: "Responsável", render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: "assigned", header: "Atribuídos", align: "right" },
    { key: "completed", header: "Resolvidos", align: "right" },
    { key: "completion_rate", header: "Taxa", align: "right", render: (r) => `${r.completion_rate}%` },
    { key: "avg", header: "Tempo médio", align: "right", render: (r) => fmtDays(r.avg_resolution_days) },
    { key: "logged_hours", header: "Horas", align: "right", render: (r) => fmtHours(r.logged_hours) },
    { key: "interactions", header: "Interações", align: "right" },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Pessoas com atividade" value={data.count ?? 0} />
      </KpiGrid>
      <SectionTitle hint="Top 12 por chamados atribuídos">Carga por responsável</SectionTitle>
      <BarList items={(data.rows ?? []).slice(0, 12).map((r: any, i: number): BarItem => ({ label: r.name, value: r.assigned, sub: `${r.completed} resolv.`, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Detalhamento por responsável</SectionTitle>
      <ReportTable columns={cols} rows={data.rows ?? []} />
    </div>
  );
}

// ── 7. Tempo gasto ──────────────────────────────────────────────────────────
function TimeTracking({ data }: { data: any }) {
  const k = data.kpis ?? {};
  const issueCols: Column<any>[] = [
    { key: "ref", header: "Chamado", render: (r) => <span className="font-medium text-primary">{ticketRef(r)}</span> },
    { key: "name", header: "Título", render: (r) => <span className="line-clamp-1">{r.name}</span> },
    { key: "project", header: "Sistema", render: (r) => r.project ?? "—" },
    { key: "hours", header: "Horas", align: "right", render: (r) => fmtHours(r.hours) },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total registrado" value={fmtHours(k.total_hours)} />
        <KpiCard label="Lançamentos" value={k.entries ?? 0} />
        <KpiCard label="Média por lançamento" value={`${k.avg_minutes_per_entry ?? 0} min`} />
      </KpiGrid>
      <SectionTitle>Horas por usuário</SectionTitle>
      <BarList unit="h" items={(data.by_user ?? []).slice(0, 12).map((u: any, i: number): BarItem => ({ label: u.name, value: u.hours, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Horas por sistema</SectionTitle>
      <BarList unit="h" items={(data.by_system ?? []).slice(0, 12).map((s: any, i: number): BarItem => ({ label: s.name, value: s.hours, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Chamados que mais consumiram tempo</SectionTitle>
      <ReportTable columns={issueCols} rows={data.top_issues ?? []} />
    </div>
  );
}

// ── 8. Interações / mensagens ───────────────────────────────────────────────
function Interactions({ data }: { data: any }) {
  const k = data.kpis ?? {};
  const issueCols: Column<any>[] = [
    { key: "ref", header: "Chamado", render: (r) => <span className="font-medium text-primary">{ticketRef(r)}</span> },
    { key: "name", header: "Título", render: (r) => <span className="line-clamp-1">{r.name}</span> },
    { key: "project", header: "Sistema", render: (r) => r.project ?? "—" },
    { key: "entity", header: "Entidade", render: (r) => r.entity ?? "—" },
    { key: "interactions", header: "Interações", align: "right" },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total de interações" value={k.total_interactions ?? 0} />
        <KpiCard label="Chamados" value={k.total_issues ?? 0} />
        <KpiCard label="Média por chamado" value={k.avg_per_issue ?? 0} />
      </KpiGrid>
      <SectionTitle hint="Possíveis gargalos">Chamados com mais interações</SectionTitle>
      <ReportTable columns={issueCols} rows={data.most_active_issues ?? []} />
      <SectionTitle>Interações por usuário</SectionTitle>
      <BarList items={(data.by_user ?? []).slice(0, 12).map((u: any, i: number): BarItem => ({ label: u.name, value: u.interactions, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Interações por sistema</SectionTitle>
      <BarList items={(data.by_system ?? []).slice(0, 12).map((s: any, i: number): BarItem => ({ label: s.name, value: s.interactions, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
    </div>
  );
}

// ── 9. Visão geral de visitas ───────────────────────────────────────────────
function VisitsOverview({ data }: { data: any }) {
  const k = data.kpis ?? {};
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total de visitas" value={k.total ?? 0} />
        <KpiCard label="Concluídas" value={k.completed ?? 0} accent="green" />
        <KpiCard label="Agendadas" value={k.scheduled ?? 0} accent="blue" />
        <KpiCard label="Canceladas" value={k.cancelled ?? 0} accent="red" />
        <KpiCard label="Duração média" value={fmtHours(k.avg_duration_hours)} />
      </KpiGrid>
      <SectionTitle>Por status</SectionTitle>
      <BarList items={(data.by_status ?? []).map((s: any, i: number): BarItem => ({ label: s.label, value: s.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Por motivo</SectionTitle>
      <BarList items={(data.by_motive ?? []).map((m: any, i: number): BarItem => ({ label: m.label, value: m.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Por técnico</SectionTitle>
      <BarList items={(data.by_technician ?? []).slice(0, 12).map((t: any, i: number): BarItem => ({ label: t.name, value: t.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Por entidade</SectionTitle>
      <BarList items={(data.by_entity ?? []).slice(0, 12).map((e: any, i: number): BarItem => ({ label: e.name, value: e.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Por cidade</SectionTitle>
      <BarList items={(data.by_city ?? []).slice(0, 12).map((c: any, i: number): BarItem => ({ label: c.name, value: c.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
    </div>
  );
}

// ── 10. Tendência temporal ──────────────────────────────────────────────────
function Trends({ data }: { data: any }) {
  const series: any[] = data.series ?? [];
  const cols: Column<any>[] = [
    { key: "month", header: "Mês", render: (r) => <span className="font-medium text-primary">{r.month}</span> },
    { key: "created", header: "Criados", align: "right" },
    { key: "completed", header: "Concluídos", align: "right" },
    { key: "net", header: "Saldo (backlog)", align: "right", render: (r) => <span className={r.net > 0 ? "text-red-600" : "text-green-600"}>{r.net > 0 ? `+${r.net}` : r.net}</span> },
  ];
  return (
    <div>
      <SectionTitle hint="Últimos 12 meses">Criados vs concluídos</SectionTitle>
      <div className="space-y-2">
        {series.map((s) => {
          const max = Math.max(1, ...series.map((x) => Math.max(x.created, x.completed)));
          return (
            <div key={s.month} className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-12 text-secondary">{s.month}</div>
              <div className="flex-1 space-y-1">
                <div className="relative h-3 overflow-hidden rounded bg-surface-2">
                  <div className="h-full rounded bg-blue-500" style={{ width: `${(s.created / max) * 100}%` }} />
                </div>
                <div className="relative h-3 overflow-hidden rounded bg-surface-2">
                  <div className="h-full rounded bg-green-500" style={{ width: `${(s.completed / max) * 100}%` }} />
                </div>
              </div>
              <div className="w-24 shrink-0 text-right text-11 tabular-nums">
                <span className="text-blue-600">{s.created}</span> / <span className="text-green-600">{s.completed}</span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-11 text-tertiary"><span className="text-blue-600">■</span> Criados &nbsp; <span className="text-green-600">■</span> Concluídos</p>
      <SectionTitle>Tabela mensal</SectionTitle>
      <ReportTable columns={cols} rows={series} />
    </div>
  );
}

// ── 11. Backlog aging ───────────────────────────────────────────────────────
function BacklogAging({ data }: { data: any }) {
  const bucketColors = ["#22c55e", "#eab308", "#f97316", "#ef4444"];
  const oldCols: Column<any>[] = [
    { key: "ref", header: "Chamado", render: (r) => <span className="font-medium text-primary">{ticketRef(r)}</span> },
    { key: "name", header: "Título", render: (r) => <span className="line-clamp-1">{r.name}</span> },
    { key: "priority_label", header: "Prioridade" },
    { key: "project", header: "Sistema", render: (r) => r.project ?? "—" },
    { key: "entity", header: "Entidade", render: (r) => r.entity ?? "—" },
    { key: "age_days", header: "Idade", align: "right", render: (r) => `${r.age_days} d` },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Chamados em aberto" value={data.total_open ?? 0} accent="amber" />
      </KpiGrid>
      <SectionTitle>Distribuição por idade</SectionTitle>
      <BarList items={(data.buckets ?? []).map((b: any, i: number): BarItem => ({ label: b.range, value: b.count, color: bucketColors[i % bucketColors.length] }))} />
      <SectionTitle hint="Top 25 mais antigos">Chamados envelhecidos</SectionTitle>
      <ReportTable columns={oldCols} rows={data.oldest ?? []} emptyLabel="Nenhum chamado em aberto." />
    </div>
  );
}

// ── 12. SLA ─────────────────────────────────────────────────────────────────
function Sla({ data }: { data: any }) {
  const k = data.kpis ?? {};
  const cols: Column<any>[] = [
    { key: "label", header: "Prioridade", render: (r) => <span className="font-medium text-primary">{r.label}</span> },
    { key: "resolved", header: "Resolvidos", align: "right" },
    { key: "avg", header: "Tempo médio", align: "right", render: (r) => fmtHours(r.avg_resolution_hours) },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Chamados resolvidos" value={k.total_resolved ?? 0} />
        <KpiCard label="Tempo médio" value={fmtHours(k.avg_resolution_hours)} />
        <KpiCard label="Resolvidos em ≤ 24h" value={`${k.pct_within_24h ?? 0}%`} accent="green" />
        <KpiCard label="Resolvidos em ≤ 72h" value={`${k.pct_within_72h ?? 0}%`} accent="green" />
      </KpiGrid>
      <SectionTitle>Distribuição dos tempos de resolução</SectionTitle>
      <BarList items={(data.bands ?? []).map((b: any, i: number): BarItem => ({ label: b.range, value: b.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle>Tempo médio por prioridade</SectionTitle>
      <ReportTable columns={cols} rows={data.by_priority ?? []} />
    </div>
  );
}

// ── 13. Dashboard executivo ─────────────────────────────────────────────────
function Executive({ data }: { data: any }) {
  const k = data.kpis ?? {};
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Total de chamados" value={k.total_tickets ?? 0} />
        <KpiCard label="Concluídos" value={k.completed ?? 0} accent="green" />
        <KpiCard label="Taxa de conclusão" value={`${k.completion_rate ?? 0}%`} accent="green" />
        <KpiCard label="Em aberto" value={k.open_total ?? 0} accent="amber" />
        <KpiCard label="Urgentes/Altas em aberto" value={k.open_high_priority ?? 0} accent="red" hint="atenção da gerência" />
        <KpiCard label="Tempo médio de resolução" value={fmtDays(k.avg_resolution_days)} />
        <KpiCard label="Horas registradas" value={fmtHours(k.total_logged_hours)} />
        <KpiCard label="Visitas técnicas" value={k.total_visits ?? 0} accent="blue" />
      </KpiGrid>
      <SectionTitle hint="Top 5">Sistemas com mais chamados</SectionTitle>
      <BarList items={(data.top_systems ?? []).map((s: any, i: number): BarItem => ({ label: s.name, value: s.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
      <SectionTitle hint="Top 5">Entidades com mais chamados</SectionTitle>
      <BarList items={(data.top_entities ?? []).map((e: any, i: number): BarItem => ({ label: e.name, value: e.count, color: CHART_PALETTE[i % CHART_PALETTE.length] }))} />
    </div>
  );
}

const RENDERERS: Record<string, (props: { data: any }) => JSX.Element> = {
  "tickets-overview": TicketsOverview,
  "by-system": BySystem,
  "by-entity": ByEntity,
  "by-priority": ByPriority,
  "by-type": ByType,
  productivity: Productivity,
  "time-tracking": TimeTracking,
  interactions: Interactions,
  "visits-overview": VisitsOverview,
  trends: Trends,
  "backlog-aging": BacklogAging,
  sla: Sla,
  executive: Executive,
};

export function ReportRenderer({ reportId, data }: { reportId: string; data: any }) {
  const Comp = RENDERERS[reportId];
  if (!Comp) return <p className="text-12 text-tertiary">Relatório desconhecido.</p>;
  return <Comp data={data} />;
}
