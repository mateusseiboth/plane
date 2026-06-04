// Resolve a Plane user's display name from the shared Plane DB. The chat schema
// has no User model (it references Plane userId as a plain string), so we read the
// `users` table directly. Cached in-process since attendant names rarely change.

import prisma from "@db";

const cache = new Map<string, string>();

export async function attendantName(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Atendente";
  const cached = cache.get(userId);
  if (cached) return cached;
  let name = "Atendente";
  try {
    const rows = (await prisma.$queryRaw`
      SELECT display_name, first_name, last_name, email
      FROM users WHERE id::text = ${userId} LIMIT 1`) as Array<{
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    }>;
    const u = rows[0];
    if (u) {
      name =
        (u.display_name && u.display_name.trim()) ||
        [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
        u.email ||
        "Atendente";
    }
  } catch {
    /* DB unavailable → fall back to generic label */
  }
  cache.set(userId, name);
  return name;
}
