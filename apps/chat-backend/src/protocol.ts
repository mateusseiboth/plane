import prisma from "@db";

// Trackable protocol number, sequential per workspace per day: YYYYMMDD-####.
export async function nextProtocol(workspaceId: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const counter = await prisma.protocolCounter.upsert({
    where: { workspaceId_day: { workspaceId, day } },
    create: { workspaceId, day, seq: 1 },
    update: { seq: { increment: 1 } },
  });
  return `${day}-${String(counter.seq).padStart(4, "0")}`;
}
