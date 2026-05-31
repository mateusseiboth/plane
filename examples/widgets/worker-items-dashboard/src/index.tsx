import React, { useState } from "react";
import { useWorkerItems, useStats, type WorkerItem } from "@qualitysistemas/widgets";

interface Props {
  entityId?: string;
  title?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
  none: "#9ca3af",
};

export default function WorkerItemsDashboard({ entityId, title = "Worker Items" }: Props) {
  const [priority, setPriority] = useState<string>("");
  const [page, setPage] = useState(0);

  const { data, loading, error, refetch } = useWorkerItems({
    entity_id: entityId,
    limit: 10,
    page,
  });

  const { data: stats } = useStats();

  const items = (data?.data ?? []).filter((i) => !priority || i.priority === priority);

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.skeleton} />
        <div style={{ ...styles.skeleton, width: "60%" }} />
        <div style={{ ...styles.skeleton, width: "80%" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.error}>
        <strong>Error loading items:</strong> {error}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>{title}</h2>
        <div style={styles.statsRow}>
          {stats && (
            <>
              <Chip label={`Total: ${stats.worker_items_total}`} color="#3b82f6" />
              <Chip label={`Open: ${stats.worker_items_open}`} color="#22c55e" />
              <Chip label={`Closed: ${stats.worker_items_closed}`} color="#9ca3af" />
            </>
          )}
        </div>
      </div>

      <div style={styles.filters}>
        <select
          style={styles.select}
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(0); }}
        >
          <option value="">All priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="none">None</option>
        </select>
        <button style={styles.btn} onClick={refetch}>Refresh</button>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "#6b7280", textAlign: "center", marginTop: 24 }}>
          No items found.
        </p>
      ) : (
        <ul style={styles.list}>
          {items.map((item) => (
            <WorkerItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}

      <div style={styles.pagination}>
        <button
          style={styles.btn}
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          ← Prev
        </button>
        <span style={{ color: "#6b7280", fontSize: 13 }}>Page {page + 1}</span>
        <button
          style={styles.btn}
          disabled={!data || items.length < 10}
          onClick={() => setPage((p) => p + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function WorkerItemRow({ item }: { item: WorkerItem }) {
  const color = PRIORITY_COLORS[item.priority] ?? "#9ca3af";
  return (
    <li style={styles.row}>
      <span style={{ ...styles.dot, background: color }} />
      <div style={{ flex: 1 }}>
        <p style={styles.itemName}>{item.name}</p>
        {item.state && (
          <p style={styles.itemMeta}>{item.state.name}</p>
        )}
      </div>
      {item.assignees[0] && (
        <span style={styles.assignee}>{item.assignees[0].display_name[0]}</span>
      )}
    </li>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ ...styles.chip, background: color + "20", color }}>
      {label}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { fontFamily: "system-ui, sans-serif", padding: 16, maxWidth: 600 },
  header: { marginBottom: 12 },
  title: { margin: 0, fontSize: 18, fontWeight: 600, color: "#111827" },
  statsRow: { display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" },
  chip: { borderRadius: 9999, padding: "2px 10px", fontSize: 12, fontWeight: 500 },
  filters: { display: "flex", gap: 8, marginBottom: 12, alignItems: "center" },
  select: { border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 8px", fontSize: 13 },
  btn: { border: "1px solid #d1d5db", borderRadius: 6, padding: "4px 10px", fontSize: 13, cursor: "pointer", background: "white" },
  list: { listStyle: "none", margin: 0, padding: 0 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f3f4f6" },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  itemName: { margin: 0, fontSize: 14, color: "#111827" },
  itemMeta: { margin: 0, fontSize: 12, color: "#6b7280" },
  assignee: { width: 28, height: 28, borderRadius: "50%", background: "#3b82f6", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600 },
  pagination: { display: "flex", gap: 12, alignItems: "center", justifyContent: "center", marginTop: 16 },
  skeleton: { height: 16, background: "#f3f4f6", borderRadius: 4, marginBottom: 10, width: "100%" },
  error: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 12, color: "#dc2626", fontSize: 14 },
};
