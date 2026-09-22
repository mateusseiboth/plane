/**
 * Numera os chamados que ficaram sem número anual ("12-2026").
 *
 * A migração 20260922120000_numero_anual_e_nao_lido já faz isto uma vez, e o
 * gatilho de `issues` numera tudo o que entra depois. Este script é para o caso
 * de uma carga feita com o gatilho desligado (ou restauração parcial).
 * Idempotente: sem chamado pendente, não faz nada.
 *
 * Uso:
 *   DATABASE_URL=postgresql://... bun run scripts/backfill-ticket-number.ts
 */
import prisma from "@db";
import { backfillNumerosDosChamados } from "@utils/numero-do-chamado";

const numerados = await backfillNumerosDosChamados();
console.log(`[backfill-ticket-number] ${numerados} chamado(s) numerado(s).`);
await prisma.$disconnect();
