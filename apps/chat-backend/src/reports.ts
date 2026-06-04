// Management reports for the attendant chat:
//  - Ratings: per-attendant satisfaction averages + a ranking + recent comments.
//  - SLA: first-response and resolution times per attendant (and overall), plus
//    how many breached the 10-minute first-response target.

import prisma from "@db";
import { attendantName } from "@/users";

const SLA_FIRST_RESPONSE_MS = 10 * 60 * 1000;

/** Satisfaction ratings grouped by attendant + an avg-score ranking. */
export async function ratingsReport(slug: string) {
  const rated = await prisma.chatSession.findMany({
    where: { workspaceId: slug, ratingScore: { not: null } },
    select: {
      assignedAttendantId: true,
      ratingScore: true,
      ratingComment: true,
      closedAt: true,
      protocol: true,
      clientName: true,
      channel: true,
    },
    orderBy: { closedAt: "desc" },
  });

  const agg = new Map<string, { sum: number; count: number; dist: number[] }>();
  for (const s of rated) {
    if (!s.assignedAttendantId || s.ratingScore == null) continue;
    let a = agg.get(s.assignedAttendantId);
    if (!a) agg.set(s.assignedAttendantId, (a = { sum: 0, count: 0, dist: [0, 0, 0, 0, 0] }));
    a.sum += s.ratingScore;
    a.count += 1;
    a.dist[s.ratingScore - 1] += 1;
  }

  const ranking = await Promise.all(
    [...agg.entries()].map(async ([userId, a]) => ({
      user_id: userId,
      name: await attendantName(userId),
      avg: Number((a.sum / a.count).toFixed(2)),
      count: a.count,
      distribution: a.dist,
    }))
  );
  ranking.sort((x, y) => y.avg - x.avg || y.count - x.count);

  const count = rated.length;
  const sum = rated.reduce((acc, r) => acc + (r.ratingScore ?? 0), 0);
  const overall = { avg: count ? Number((sum / count).toFixed(2)) : 0, count };

  const comments = await Promise.all(
    rated
      .filter((r) => r.ratingComment)
      .slice(0, 50)
      .map(async (r) => ({
        protocol: r.protocol,
        client_name: r.clientName,
        channel: r.channel,
        score: r.ratingScore,
        comment: r.ratingComment,
        attendant: r.assignedAttendantId ? await attendantName(r.assignedAttendantId) : null,
        closed_at: r.closedAt,
      }))
  );

  return { overall, ranking, comments };
}

/** First-response / resolution SLA stats over the last `days` days. */
export async function slaReport(slug: string, days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const sessions = await prisma.chatSession.findMany({
    where: { workspaceId: slug, createdAt: { gte: since }, assignedAttendantId: { not: null } },
    select: { id: true, assignedAttendantId: true, createdAt: true, closedAt: true, status: true },
  });

  const ids = sessions.map((s) => s.id);
  const firstAttendant = ids.length
    ? await prisma.chatMessage.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: ids }, sender: "attendant" },
        _min: { createdAt: true },
      })
    : [];
  const firstMap = new Map(firstAttendant.map((g) => [g.sessionId, g._min.createdAt]));

  type Agg = { respSum: number; respN: number; resSum: number; resN: number; breaches: number; count: number };
  const blank = (): Agg => ({ respSum: 0, respN: 0, resSum: 0, resN: 0, breaches: 0, count: 0 });
  const per = new Map<string, Agg>();
  const all = blank();

  for (const s of sessions) {
    const a = per.get(s.assignedAttendantId!) ?? per.set(s.assignedAttendantId!, blank()).get(s.assignedAttendantId!)!;
    a.count += 1;
    all.count += 1;
    const fa = firstMap.get(s.id);
    if (fa) {
      const resp = fa.getTime() - s.createdAt.getTime();
      a.respSum += resp;
      a.respN += 1;
      all.respSum += resp;
      all.respN += 1;
      if (resp > SLA_FIRST_RESPONSE_MS) {
        a.breaches += 1;
        all.breaches += 1;
      }
    }
    if (s.closedAt) {
      const res = s.closedAt.getTime() - s.createdAt.getTime();
      a.resSum += res;
      a.resN += 1;
      all.resSum += res;
      all.resN += 1;
    }
  }

  const sec = (ms: number) => Math.round(ms / 1000);
  const shape = (a: Agg) => ({
    count: a.count,
    avg_first_response_sec: a.respN ? sec(a.respSum / a.respN) : null,
    avg_resolution_sec: a.resN ? sec(a.resSum / a.resN) : null,
    breaches: a.breaches,
    breach_rate: a.respN ? Number((a.breaches / a.respN).toFixed(2)) : 0,
  });

  const ranking = await Promise.all(
    [...per.entries()].map(async ([userId, a]) => ({ user_id: userId, name: await attendantName(userId), ...shape(a) }))
  );
  // Best responders first (lowest avg first-response time).
  ranking.sort((x, y) => (x.avg_first_response_sec ?? Infinity) - (y.avg_first_response_sec ?? Infinity));

  return { days, threshold_sec: SLA_FIRST_RESPONSE_MS / 1000, overall: shape(all), ranking };
}
