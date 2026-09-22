import prisma from "@db";

// Protocolo do atendimento: AAAAMMDD-####, sequencial por DIA e único no banco
// inteiro. É global de propósito: `chat_sessions.protocol` é único e a
// transcrição abre por `/sessions/by-protocol/:protocol/`, sem espaço. Um
// contador por espaço fazia dois espaços no mesmo dia colidirem.
//
// Uma linha só por dia (`workspace_id` = GLOBAL) e o `INSERT ... ON CONFLICT`
// trava a linha, então aberturas simultâneas nunca repetem número. O MAX dos
// protocolos já gravados no dia só pesa na primeira abertura: é o que evita
// colidir com os números que os contadores antigos, por espaço, já deram hoje.
const GLOBAL = "__global__";

export async function nextProtocol(): Promise<string> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const [{ seq }] = await prisma.$queryRaw<{ seq: number }[]>`
    INSERT INTO chat_protocol_counters (id, workspace_id, day, seq)
    VALUES (
      gen_random_uuid(),
      ${GLOBAL},
      ${day},
      COALESCE((
        SELECT MAX(split_part(protocol, '-', 2)::int)
          FROM chat_sessions
         WHERE protocol ~ ('^' || ${day} || '-[0-9]+$')
      ), 0) + 1
    )
    ON CONFLICT (workspace_id, day)
    DO UPDATE SET seq = GREATEST(chat_protocol_counters.seq + 1, EXCLUDED.seq)
    RETURNING seq`;
  return `${day}-${String(seq).padStart(4, "0")}`;
}
