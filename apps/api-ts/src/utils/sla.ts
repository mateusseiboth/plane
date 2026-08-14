// SLA — automatic due date from label deadlines + priority adjustment (C).
//
// target_date = base + max(label.slaHours) + priorityAdjustment(priority)
// All in CALENDAR hours.
//
// O instante calculado aqui sempre teve hora — o que o descartava era a
// serialização, que recortava `target_date` na data. Agora ele chega inteiro à
// tela: uma etiqueta de 4h aberta às 9h vence às 13h do MESMO dia, e não mais
// "hoje" sem hora. Ver @utils/prazo. Returns null when no label carries an SLA (nothing to
// auto-fill). Priority adjustment is read from Instance.configurations.priority_sla
// (a map priority → +/- hours; negative shortens the deadline) and is only
// applied when there is a label SLA to adjust.
import prisma from "@db";

const DEFAULT_PRIORITY_SLA: Record<string, number> = {urgent: -8, high: -4, medium: 0, low: 8, none: 0};

let cachedPrioritySla: {value: Record<string, number>; at: number} | null = null;

export async function getPrioritySla(): Promise<Record<string, number>> {
  // light 30s cache to avoid hitting the instance row on every mutation
  if (cachedPrioritySla && Date.now() - cachedPrioritySla.at < 30_000) return cachedPrioritySla.value;
  const instance = await prisma.instance.findFirst({select: {configurations: true}});
  const cfg = (instance?.configurations as any)?.priority_sla;
  const value = cfg && typeof cfg === "object" ? {...DEFAULT_PRIORITY_SLA, ...cfg} : DEFAULT_PRIORITY_SLA;
  cachedPrioritySla = {value, at: Date.now()};
  return value;
}

export function invalidatePrioritySlaCache() {
  cachedPrioritySla = null;
}

/**
 * Compute the auto due date for an issue given its labels + priority.
 * Returns null when none of the labels define an SLA.
 */
export async function computeTargetDate(labelIds: string[], priority: string | null | undefined, base: Date): Promise<Date | null> {
  if (!labelIds.length) return null;
  const labels = await prisma.label.findMany({where: {id: {in: labelIds}, deletedAt: null}, select: {slaHours: true}});
  const slaValues = labels.map((l) => l.slaHours).filter((h): h is number => typeof h === "number");
  if (!slaValues.length) return null;
  const labelHours = Math.max(...slaValues);

  const prioritySla = await getPrioritySla();
  const adjust = prioritySla[priority ?? "none"] ?? 0;

  const totalHours = Math.max(0, labelHours + adjust);
  return new Date(base.getTime() + totalHours * 60 * 60 * 1000);
}
