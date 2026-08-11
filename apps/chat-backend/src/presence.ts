// Availability:
//  - the company is within its (global) business hours and not on a break, AND
//  - the attendant is connected on the WS hub AND not marked invisible by an admin.
// Business hours are workspace-wide (BotConfig.businessHours/businessBreaks), not
// per-attendant.

import {connectedUserIds} from "@/ws/hub";
import prisma from "@db";

type Window = {weekday: number | string; start_time: string; end_time: string};

/** Fuso usado quando o espaço de trabalho não tem um configurado. */
const FUSO_PADRAO = process.env.TZ_PADRAO ?? "America/Campo_Grande";

const fusoPorWorkspace = new Map<string, string>();

/**
 * Fuso do espaço de trabalho, em cache.
 *
 * A consulta é por slug porque é isso que o chat carrega como `workspaceId`.
 * O valor muda de ano em ano, na prática nunca — guardar em memória evita uma
 * ida ao banco em cada mensagem que o robô processa.
 */
async function fusoDoWorkspace(workspaceId: string): Promise<string> {
  const emCache = fusoPorWorkspace.get(workspaceId);
  if (emCache) return emCache;
  let fuso = FUSO_PADRAO;
  try {
    const linhas = (await prisma.$queryRaw`
      SELECT timezone FROM workspaces WHERE slug = ${workspaceId} AND deleted_at IS NULL LIMIT 1
    `) as Array<{timezone: string | null}>;
    fuso = linhas[0]?.timezone || FUSO_PADRAO;
  } catch {
    // Banco indisponível: o padrão já é melhor que UTC.
  }
  fusoPorWorkspace.set(workspaceId, fuso);
  return fuso;
}

const DIAS: Record<string, number> = {Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6};

/**
 * Dia da semana e minutos do dia NO FUSO DA EMPRESA.
 *
 * `new Date().getHours()` devolve a hora do container, que roda em UTC. O
 * horário é cadastrado em hora local, então às 08:21 de Campo Grande o servidor
 * via 12:21 e casava com o intervalo de almoço (11:30–13:00): o robô respondia
 * "estamos fora do horário de atendimento" em plena manhã de trabalho.
 */
function agoraNoFuso(fuso: string): {weekday: number; minutes: number} {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  // "24" aparece à meia-noite em algumas plataformas com hour12:false.
  const hora = Number(valor("hour")) % 24;
  return {weekday: DIAS[valor("weekday")] ?? 0, minutes: hora * 60 + Number(valor("minute"))};
}

function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Is the company currently open (within a business-hours window, not on a break)? */
export async function isWithinBusinessHours(workspaceId: string): Promise<boolean> {
  const cfg = await prisma.botConfig.findUnique({where: {workspaceId}});
  const hours = ((cfg?.businessHours as Window[]) ?? []).filter(Boolean);
  // Not configured → always open.
  if (hours.length === 0) return true;
  const {weekday, minutes} = agoraNoFuso(await fusoDoWorkspace(workspaceId));
  const todays = hours.filter((h) => Number(h.weekday) === weekday);
  if (todays.length === 0) return false;
  const open = todays.some((h) => minutes >= toMinutes(h.start_time) && minutes < toMinutes(h.end_time));
  if (!open) return false;
  const breaks = ((cfg?.businessBreaks as Window[]) ?? []).filter((b) => Number(b.weekday) === weekday);
  return !breaks.some((b) => minutes >= toMinutes(b.start_time) && minutes < toMinutes(b.end_time));
}

/** Attendant ids that are connected to the WS AND not marked invisible. */
export async function availableAttendants(workspaceId: string, candidateUserIds: string[]): Promise<string[]> {
  const connected = connectedUserIds(workspaceId);
  let invisible = new Set<string>();
  try {
    const rows = await (prisma as any).attendantStatus.findMany({where: {workspaceId, isInvisible: true}, select: {userId: true}});
    invisible = new Set(rows.map((s: any) => s.userId));
  } catch {
    // attendantStatus table may not exist yet if migration hasn't run — treat everyone as visible.
  }
  return candidateUserIds.filter((id) => connected.has(id) && !invisible.has(id));
}
