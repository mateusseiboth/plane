/**
 * Monitor ao vivo do atendimento (legado `intranet/chatger/`): quanto o cliente
 * esperou na fila, quanto durou o atendimento e quanto o atendente levou para
 * responder, com mínimo, média e máximo. Puro: a entrada são as conversas do dia
 * e as mensagens delas, já carregadas.
 *
 * Definições (o chat não grava o instante em que a conversa saiu da fila):
 *  - fila:        da abertura da conversa à PRIMEIRA mensagem do atendente;
 *  - atendimento: da primeira mensagem do atendente ao encerramento, só nas
 *                 finalizadas (abandono não conta);
 *  - resposta:    depois da primeira resposta, do primeiro cliente sem resposta
 *                 até a mensagem seguinte do atendente.
 */

export type Resumo = { min: number | null; media: number | null; max: number | null; amostras: number };

export function summarize(segundos: number[]): Resumo {
  if (!segundos.length) return { min: null, media: null, max: null, amostras: 0 };
  const soma = segundos.reduce((total, s) => total + s, 0);
  return {
    min: Math.min(...segundos),
    media: Math.round(soma / segundos.length),
    max: Math.max(...segundos),
    amostras: segundos.length,
  };
}

export type SessaoDoMonitor = { id: string; createdAt: Date; closedAt: Date | null; abandonada: boolean };
export type MensagemDoMonitor = { sessionId: string; sender: string; createdAt: Date };

const segundosEntre = (de: Date, ate: Date) => Math.max(0, Math.round((ate.getTime() - de.getTime()) / 1000));

/** Esperas do cliente por resposta, depois que o atendente já entrou na conversa. */
function readRespostas(mensagens: MensagemDoMonitor[]): number[] {
  const respostas: number[] = [];
  let pendenteDesde: Date | null = null;
  for (const m of mensagens) {
    if (m.sender === "client" && !pendenteDesde) pendenteDesde = m.createdAt;
    if (m.sender === "attendant" && pendenteDesde) {
      respostas.push(segundosEntre(pendenteDesde, m.createdAt));
      pendenteDesde = null;
    }
  }
  return respostas;
}

function groupPorSessao(mensagens: MensagemDoMonitor[]): Map<string, MensagemDoMonitor[]> {
  const grupos = new Map<string, MensagemDoMonitor[]>();
  for (const m of mensagens) grupos.set(m.sessionId, [...(grupos.get(m.sessionId) ?? []), m]);
  return grupos;
}

export function computeTempos(sessoes: SessaoDoMonitor[], mensagens: MensagemDoMonitor[]) {
  const porSessao = groupPorSessao(mensagens.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  const fila: number[] = [];
  const atendimento: number[] = [];
  const resposta: number[] = [];
  for (const s of sessoes) {
    const doChat = porSessao.get(s.id) ?? [];
    const primeira = doChat.findIndex((m) => m.sender === "attendant");
    if (primeira < 0) continue;
    const entrada = doChat[primeira]!.createdAt;
    fila.push(segundosEntre(s.createdAt, entrada));
    if (s.closedAt && !s.abandonada) atendimento.push(segundosEntre(entrada, s.closedAt));
    resposta.push(...readRespostas(doChat.slice(primeira + 1)));
  }
  return { fila: summarize(fila), atendimento: summarize(atendimento), resposta: summarize(resposta) };
}
