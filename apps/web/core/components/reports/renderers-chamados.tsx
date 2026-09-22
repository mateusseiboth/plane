/**
 * Renderizadores dos relatórios sobre os marcos por etapa: chamados por usuário,
 * sintético semanal, devolvidos, log de chamados e balanço. Mais as seções que
 * estendem "por sistema", "por tipo", "visitas" e "tempo gasto".
 */
import { EmptyHint, KpiCard, KpiGrid, ReportTable, SectionTitle, fmtHours, type Column } from "./ui";

const fmtData = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const fmtDataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

/** Número anual primeiro (N-AAAA); o PROJ-123 vem abaixo, menor. */
export function ChamadoRef({ row }: { row: { ticket_number?: string | null; identifier?: string | null } }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-medium text-primary">{row.ticket_number ?? row.identifier ?? "—"}</span>
      {row.ticket_number && row.identifier && <span className="text-11 text-tertiary">{row.identifier}</span>}
    </span>
  );
}

const colunaChamado: Column<any> = { key: "ref", header: "Chamado", render: (r) => <ChamadoRef row={r} /> };
const colunaTitulo: Column<any> = {
  key: "name",
  header: "Título",
  render: (r) => <span className="line-clamp-2">{r.name}</span>,
};

const marcoComAutor = (em: string | null, por: string | null) => (
  <span className="flex flex-col leading-tight">
    <span>{fmtData(em)}</span>
    {por && <span className="text-11 text-tertiary">{por}</span>}
  </span>
);

// ── Chamados por usuário (marcos) ──────────────────────────────────────────────
function MilestonesByUser({ data }: { data: any }) {
  const cols: Column<any>[] = [
    colunaChamado,
    colunaTitulo,
    { key: "project", header: "Sistema" },
    { key: "tipo_label", header: "Tipo" },
    { key: "state", header: "Etapa" },
    { key: "atribuido", header: "Atribuído", render: (r) => fmtData(r.marcos.atribuido_em) },
    { key: "inicio", header: "Início TI", render: (r) => fmtData(r.marcos.inicio_ti_em) },
    {
      key: "finalizado",
      header: "Finalizado TI",
      render: (r) => marcoComAutor(r.marcos.finalizado_ti_em, r.marcos.finalizado_ti_por),
    },
    {
      key: "homologado",
      header: "Homologado",
      render: (r) => marcoComAutor(r.marcos.homologado_em, r.marcos.homologado_por),
    },
    { key: "encerrado", header: "Encerrado", render: (r) => fmtData(r.marcos.encerrado_em) },
    { key: "devolucoes", header: "Devoluções", align: "right", render: (r) => r.marcos.devolucoes },
  ];
  const usuarios: any[] = data.usuarios ?? [];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Chamados" value={data.total ?? 0} />
        <KpiCard label="Pessoas" value={usuarios.length} />
      </KpiGrid>
      {!usuarios.length && <EmptyHint />}
      {usuarios.map((u) => (
        <div key={u.user_id} className="print-avoid-break">
          <SectionTitle hint={`${u.total} chamado(s)`}>{u.name}</SectionTitle>
          <ReportTable columns={cols} rows={u.chamados} />
        </div>
      ))}
    </div>
  );
}

// ── Sintético semanal ──────────────────────────────────────────────────────────
function WeeklySummary({ data }: { data: any }) {
  const tipos: { key: string; label: string }[] = data.tipos ?? [];
  const contagem = (grupo: "concluidos" | "pendentes", rotulo: string): Column<any>[] => [
    ...tipos.map((t) => ({
      key: `${grupo}-${t.key}`,
      header: `${rotulo} ${t.label}`,
      align: "right" as const,
      render: (r: any) => r[grupo][t.key],
    })),
    {
      key: `${grupo}-total`,
      header: `${rotulo} total`,
      align: "right" as const,
      render: (r: any) => <strong>{r[grupo].total}</strong>,
    },
  ];
  const cols: Column<any>[] = [
    { key: "name", header: "Sistema", render: (r) => <span className="font-medium text-primary">{r.name}</span> },
    { key: "interacoes", header: "Interações", align: "right" },
    ...contagem("concluidos", "Concl."),
    ...contagem("pendentes", "Pend."),
  ];
  const usuarios: any[] = data.usuarios ?? [];
  return (
    <div>
      <p className="text-12 text-secondary">
        Semana de {fmtData(data.periodo?.inicio)} a {fmtData(data.periodo?.fim)}
      </p>
      {!usuarios.length && <EmptyHint />}
      {usuarios.map((u) => (
        <div key={u.user_id} className="print-avoid-break">
          <SectionTitle
            hint={`${u.totais.interacoes} interações · ${u.totais.concluidos} concluídos · ${u.totais.pendentes} pendentes`}
          >
            {u.name}
          </SectionTitle>
          <ReportTable columns={cols} rows={u.sistemas} />
        </div>
      ))}
    </div>
  );
}

// ── Devolvidos ─────────────────────────────────────────────────────────────────
function Returned({ data }: { data: any }) {
  const cols: Column<any>[] = [
    colunaChamado,
    colunaTitulo,
    { key: "project", header: "Sistema" },
    { key: "entity", header: "Entidade", render: (r) => r.entity ?? "—" },
    { key: "state", header: "Etapa atual" },
    { key: "total_devolucoes", header: "Devoluções", align: "right" },
    {
      key: "devolucoes",
      header: "Devolvido por",
      render: (r) => (
        <span className="flex flex-col leading-tight">
          {r.devolucoes.map((d: any) => (
            <span key={d.em}>
              {fmtDataHora(d.em)} · {d.por ?? "—"}
            </span>
          ))}
        </span>
      ),
    },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Chamados devolvidos" value={data.kpis?.chamados ?? 0} accent="amber" />
        <KpiCard label="Devoluções" value={data.kpis?.devolucoes ?? 0} accent="red" />
      </KpiGrid>
      <SectionTitle>Chamados</SectionTitle>
      <ReportTable columns={cols} rows={data.rows ?? []} emptyLabel="Nenhuma devolução no período." />
    </div>
  );
}

// ── Log de chamados ────────────────────────────────────────────────────────────
function TicketLog({ data }: { data: any }) {
  const cols: Column<any>[] = [
    { key: "em", header: "Data e hora", render: (r) => fmtDataHora(r.em) },
    { key: "chamado", header: "Chamado", render: (r) => <ChamadoRef row={r.chamado} /> },
    {
      key: "titulo",
      header: "Título",
      render: (r) => <span className="line-clamp-2">{r.chamado.name}</span>,
    },
    { key: "sistema", header: "Sistema", render: (r) => r.chamado.project ?? "—" },
    { key: "usuario", header: "Usuário", render: (r) => r.usuario.name },
    { key: "funcao", header: "Função", render: (r) => r.funcao?.nome ?? "—" },
    { key: "acao", header: "Ação" },
    {
      key: "detalhe",
      header: "Detalhe",
      render: (r) => r.texto ?? ([r.de, r.para].some(Boolean) ? `${r.de ?? "—"} → ${r.para ?? "—"}` : "—"),
    },
  ];
  const rows: any[] = data.rows ?? [];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Registros" value={data.total ?? 0} />
      </KpiGrid>
      {data.truncado && (
        <p className="mt-3 text-12 text-secondary">
          Mostrando os {rows.length} mais recentes. Use os filtros para ver o restante.
        </p>
      )}
      <SectionTitle>Histórico</SectionTitle>
      <ReportTable columns={cols} rows={rows} />
    </div>
  );
}

const saldo = (valor: number) => <span className={valor > 0 ? "text-red-600" : "text-green-600"}>{valor}</span>;

// ── Balanço ────────────────────────────────────────────────────────────────────
function Balance({ data }: { data: any }) {
  const t = data.totais ?? {};
  const cols: Column<any>[] = [
    { key: "periodo", header: data.granularidade === "ano" ? "Ano" : "Mês" },
    { key: "saldo_anterior", header: "Saldo anterior", align: "right" },
    { key: "abertos", header: "Abertos", align: "right" },
    { key: "encerrados", header: "Encerrados", align: "right" },
    {
      key: "diferenca",
      header: "Encerrados menos abertos",
      align: "right",
      render: (r) => <span className={r.diferenca < 0 ? "text-red-600 font-semibold" : ""}>{r.diferenca}</span>,
    },
    { key: "saldo_atual", header: "Saldo atual", align: "right", render: (r) => saldo(r.saldo_atual) },
  ];
  return (
    <div>
      <KpiGrid>
        <KpiCard label="Saldo no início" value={t.saldo_inicial ?? 0} />
        <KpiCard label="Abertos" value={t.abertos ?? 0} accent="blue" />
        <KpiCard label="Encerrados" value={t.encerrados ?? 0} accent="green" />
        <KpiCard label="Saldo no fim" value={t.saldo_final ?? 0} accent="amber" />
      </KpiGrid>
      <SectionTitle hint={`${fmtData(data.periodo?.inicio)} a ${fmtData(data.periodo?.fim)}`}>Balanço</SectionTitle>
      <ReportTable columns={cols} rows={data.linhas ?? []} />
    </div>
  );
}

export const RENDERERS_DE_CHAMADOS: Record<string, (props: { data: any }) => JSX.Element> = {
  "milestones-by-user": MilestonesByUser,
  "weekly-summary": WeeklySummary,
  returned: Returned,
  "ticket-log": TicketLog,
  balance: Balance,
};

// ── Seções que estendem relatórios existentes ─────────────────────────────────

const SITUACOES = [
  { key: "pendente", label: "Pendente" },
  { key: "em_andamento", label: "Em andamento" },
  { key: "a_homologar", label: "A homologar" },
  { key: "concluido", label: "Concluído" },
];

const TIPOS = [
  { key: "correcao", label: "Correção" },
  { key: "melhoria", label: "Melhoria" },
  { key: "projeto", label: "Projeto" },
  { key: "outros", label: "Outros" },
];

const colunaSistema: Column<any> = {
  key: "name",
  header: "Sistema",
  render: (r) => <span className="font-medium text-primary">{r.name}</span>,
};

/** "Chamados por sistema": situação do painel do SAC e cruzamento com o tipo. */
export function SituacaoPorSistema({ rows }: { rows: any[] }) {
  const comSituacao = rows.filter((r) => r.situacoes);
  const situacaoCols: Column<any>[] = [
    colunaSistema,
    ...SITUACOES.map((s) => ({
      key: s.key,
      header: s.label,
      align: "right" as const,
      render: (r: any) => r.situacoes[s.key],
    })),
  ];
  const tipoCols: Column<any>[] = [
    colunaSistema,
    ...TIPOS.flatMap((t) => [
      {
        key: `${t.key}-total`,
        header: t.label,
        align: "right" as const,
        render: (r: any) => r.por_tipo[t.key].total,
      },
      {
        key: `${t.key}-aberto`,
        header: `${t.label} em aberto`,
        align: "right" as const,
        render: (r: any) => r.por_tipo[t.key].total - r.por_tipo[t.key].concluido - r.por_tipo[t.key].cancelado,
      },
    ]),
  ];
  return (
    <>
      <SectionTitle>Situação por sistema</SectionTitle>
      <ReportTable columns={situacaoCols} rows={comSituacao} />
      <SectionTitle>Sistema por tipo</SectionTitle>
      <ReportTable columns={tipoCols} rows={comSituacao} />
    </>
  );
}

/** "Chamados por tipo": matriz sistema × tipo. */
export function MatrizSistemaPorTipo({ rows }: { rows: any[] }) {
  const cols: Column<any>[] = [
    colunaSistema,
    ...TIPOS.map((t) => ({ key: t.key, header: t.label, align: "right" as const })),
    { key: "total", header: "Total", align: "right" },
  ];
  return (
    <>
      <SectionTitle>Sistema por tipo</SectionTitle>
      <ReportTable columns={cols} rows={rows} />
    </>
  );
}

/** "Tempo gasto": os lançamentos de cada analista. */
export function LancamentosPorAnalista({ analistas }: { analistas: any[] }) {
  const cols: Column<any>[] = [
    {
      key: "logged_date",
      header: "Data",
      render: (r) => r.logged_date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1"),
    },
    { key: "chamado", header: "Chamado", render: (r) => <ChamadoRef row={r.issue} /> },
    { key: "titulo", header: "Título", render: (r) => <span className="line-clamp-2">{r.issue.name}</span> },
    { key: "sistema", header: "Sistema", render: (r) => r.issue.project ?? "—" },
    { key: "description", header: "Descrição", render: (r) => r.description || "—" },
    { key: "hours", header: "Horas", align: "right", render: (r) => fmtHours(r.hours) },
  ];
  return (
    <>
      {analistas.map((a) => (
        <div key={a.user_id} className="print-avoid-break">
          <SectionTitle hint={`${fmtHours(a.hours)} em ${a.entries.length} lançamento(s)`}>{a.name}</SectionTitle>
          <ReportTable columns={cols} rows={a.entries} />
        </div>
      ))}
    </>
  );
}
