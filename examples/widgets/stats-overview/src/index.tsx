import React from "react";
import { useStats, useCurrentUser } from "@mateusseiboth/widgets-aviao";

interface Props {
  workspaceSlug?: string;
}

export default function StatsOverview({ workspaceSlug }: Props) {
  const { data: stats, loading, error, refetch } = useStats({ workspace_slug: workspaceSlug });
  const { data: currentUser } = useCurrentUser();

  if (loading) {
    return (
      <div style={s.container}>
        <p style={{ color: "#9ca3af" }}>Loading stats…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...s.container, ...s.error }}>
        Failed to load stats: {error}
      </div>
    );
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <h2 style={s.title}>Platform Overview</h2>
        {currentUser && (
          <span style={s.greeting}>Hello, {currentUser.display_name} 👋</span>
        )}
        <button style={s.btn} onClick={refetch}>↺</button>
      </div>

      <div style={s.grid}>
        <StatCard
          label="Total Work Items"
          value={stats?.worker_items_total ?? 0}
          color="#3b82f6"
          icon="📋"
        />
        <StatCard
          label="Open"
          value={stats?.worker_items_open ?? 0}
          color="#22c55e"
          icon="🟢"
        />
        <StatCard
          label="Closed"
          value={stats?.worker_items_closed ?? 0}
          color="#6b7280"
          icon="✅"
        />
        <StatCard
          label="Intakes"
          value={stats?.intakes_total ?? 0}
          color="#f59e0b"
          icon="📥"
        />
        <StatCard
          label="Actions"
          value={stats?.actions_total ?? 0}
          color="#8b5cf6"
          icon="⚡"
        />
        {stats && stats.worker_items_total > 0 && (
          <StatCard
            label="Completion Rate"
            value={`${Math.round((stats.worker_items_closed / stats.worker_items_total) * 100)}%`}
            color="#ec4899"
            icon="📈"
          />
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon: string;
}) {
  return (
    <div style={{ ...s.card, borderTopColor: color }}>
      <div style={s.cardIcon}>{icon}</div>
      <p style={{ ...s.cardValue, color }}>{value}</p>
      <p style={s.cardLabel}>{label}</p>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { fontFamily: "system-ui, sans-serif", padding: 16 },
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  title: { margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" },
  greeting: { fontSize: 13, color: "#6b7280", flex: 1 },
  btn: { border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 10px", cursor: "pointer", background: "white", fontSize: 16 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 },
  card: {
    background: "white",
    border: "1px solid #e5e7eb",
    borderTopWidth: 3,
    borderRadius: 8,
    padding: 12,
    textAlign: "center",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  },
  cardIcon: { fontSize: 24, marginBottom: 6 },
  cardValue: { margin: "0 0 4px", fontSize: 24, fontWeight: 700 },
  cardLabel: { margin: 0, fontSize: 12, color: "#6b7280" },
  error: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#dc2626" },
};
