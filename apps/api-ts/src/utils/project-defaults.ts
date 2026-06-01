// Canonical per-project defaults (pt-BR workflow). Shared by the seeder and the
// SAC migration so projects always get the full, translated state set, intake
// enabled, and the standard labels — no matter how they were created.
//
// ensureProjectDefaults() is idempotent and safe to run on every startup; it is
// the single source of truth for "what every project must have".

// Default states created for every project (pt-BR). Order/sequence define the board.
export const DEFAULT_STATES = [
  {name: "Triagem", color: "#6366f1", group: "triage", sequence: 5000, isTriage: true},
  {name: "Pendências", color: "#94a3b8", group: "backlog", sequence: 10000, isDefault: true},
  {name: "A Fazer", color: "#64748b", group: "unstarted", sequence: 15000},
  {name: "Em Análise", color: "#eab308", group: "started", sequence: 20000},
  {name: "Em Desenvolvimento", color: "#3b82f6", group: "started", sequence: 25000},
  {name: "Em Teste", color: "#8b5cf6", group: "started", sequence: 30000},
  {name: "Concluído", color: "#16a34a", group: "completed", sequence: 40000},
  {name: "Cancelado", color: "#dc2626", group: "cancelled", sequence: 50000},
] as const;

// Legacy/English (and old pt-BR) names → canonical pt-BR. Renaming preserves the
// state id, so existing issues stay linked.
export const STATE_RENAME: Record<string, string> = {
  "In Take": "Triagem",
  "In take": "Triagem",
  Backlog: "Pendências",
  "In Progress": "Em Desenvolvimento",
  "Em Andamento": "Em Desenvolvimento",
  "In Test": "Em Teste",
  Done: "Concluído",
  Cancelled: "Cancelado",
  Avaliando: "Em Análise",
};

// Default labels with SLA (calendar hours; null = no auto deadline).
export const DEFAULT_LABELS = [
  {name: "Correção", color: "#ef4444", slaHours: 16},
  {name: "Melhoria", color: "#3b82f6", slaHours: 96}, // 4 dias
  {name: "Projeto", color: "#8b5cf6", slaHours: null as number | null},
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Ensure every project in the workspace has the canonical states, intake enabled,
 * and the default labels. Accepts a PrismaClient instance (works from seed.ts and
 * the migration). Returns counts for logging.
 */
export async function ensureProjectDefaults(db: any, workspaceId: string) {
  const projects = await db.project.findMany({where: {workspaceId, deletedAt: null}, select: {id: true}});
  let statesRenamed = 0;
  let statesCreated = 0;
  let intakesCreated = 0;
  let labelsCreated = 0;

  for (const p of projects) {
    // ── States ──────────────────────────────────────────────────────────────
    const states = await db.state.findMany({where: {projectId: p.id, deletedAt: null}, select: {id: true, name: true}});
    const byName = new Map<string, {id: string; name: string}>(states.map((s: any) => [s.name, s]));

    // 1) rename legacy names → canonical pt-BR (only when target not present)
    for (const [from, to] of Object.entries(STATE_RENAME)) {
      if (byName.has(from) && !byName.has(to)) {
        const s = byName.get(from)!;
        await db.state.update({where: {id: s.id}, data: {name: to, slug: slugify(to)}});
        byName.set(to, s);
        byName.delete(from);
        statesRenamed++;
      }
    }

    // 2) create any missing default states
    for (const st of DEFAULT_STATES) {
      if (byName.has(st.name)) continue;
      await db.state.create({
        data: {
          projectId: p.id,
          workspaceId,
          name: st.name,
          color: st.color,
          group: st.group,
          sequence: st.sequence,
          default: false,
          isTriage: st.group === "triage",
          slug: slugify(st.name),
        },
      });
      statesCreated++;
    }

    // 3) default must be Pendências (never Concluído)
    const pend = await db.state.findFirst({where: {projectId: p.id, name: "Pendências", deletedAt: null}, select: {id: true}});
    if (pend) {
      await db.state.updateMany({where: {projectId: p.id, default: true}, data: {default: false}});
      await db.state.update({where: {id: pend.id}, data: {default: true}});
    }

    // ── Intake ──────────────────────────────────────────────────────────────
    await db.project.update({where: {id: p.id}, data: {intakeView: true}});
    const intakeCount = await db.intake.count({where: {projectId: p.id}});
    if (intakeCount === 0) {
      await db.intake.create({data: {projectId: p.id, workspaceId, name: "Intake", isActive: true}});
      intakesCreated++;
    }

    // ── Default labels ────────────────────────────────────────────────────────
    for (const dl of DEFAULT_LABELS) {
      const exists = await db.label.findFirst({where: {projectId: p.id, name: dl.name, deletedAt: null}, select: {id: true}});
      if (exists) continue;
      await db.label.create({data: {workspaceId, projectId: p.id, name: dl.name, color: dl.color, slaHours: dl.slaHours}});
      labelsCreated++;
    }
  }

  return {projects: projects.length, statesRenamed, statesCreated, intakesCreated, labelsCreated};
}
