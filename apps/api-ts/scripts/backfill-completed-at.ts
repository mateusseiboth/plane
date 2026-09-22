/**
 * Acerta `issues.completed_at` dos chamados gravados antes do gatilho
 * `issues_sync_completed_at` (ou numa carga feita com ele desligado).
 *
 * A migração 20260923090000_data_de_conclusao já roda isto uma vez.
 * Idempotente: sem chamado pendente, não faz nada.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... bun run scripts/backfill-completed-at.ts
 */
import prisma from "@db";
import { backfillDatasDeConclusao } from "@utils/data-de-conclusao";

const acertados = await backfillDatasDeConclusao();
console.log(`[backfill-completed-at] ${acertados} chamado(s) acertado(s).`);
await prisma.$disconnect();
