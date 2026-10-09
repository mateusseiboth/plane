/**
 * Quem vê qual conversa na lista do atendente (`GET /workspaces/:slug/sessions/`).
 *
 * A regra é pela matriz de ações, não pelo papel:
 *  - as conversas atribuídas a si, sempre;
 *  - as dos outros (inclusive encerradas e as que a pessoa acabou de
 *    transferir) com `chat.ver_todas`;
 *  - a fila e o robô (`bot`, `queued`) só com `chat.ver_fila`.
 *
 * É por isso que quem vê as dos outros continua vendo um atendimento que
 * transferiu, e quem só vê as próprias deixa de ver na hora.
 *
 * O filtro do banco e o predicado em memória ficam lado a lado, sobre a mesma
 * regra, para não divergirem.
 */

const FILA = ["bot", "queued"];

export type AcessoDaLista = { userId: string; verTodas: boolean; verFila: boolean };

type SessaoNaLista = { assignedAttendantId?: string | null; status: string };

const isDaFila = (status: string) => FILA.includes(status);

/** O pedaço do `where` que depende de quem pede; `pedidos` é o `?status=` da URL. */
export function buildFiltroDaVisibilidade(acesso: AcessoDaLista, pedidos: string[] | null) {
  const atribuidas = {
    status: pedidos ? { in: pedidos.filter((s) => !isDaFila(s)) } : { notIn: FILA },
    ...(acesso.verTodas ? {} : { assignedAttendantId: acesso.userId }),
  };
  const daFila = { status: { in: pedidos ? pedidos.filter(isDaFila) : FILA } };
  return { OR: acesso.verFila ? [atribuidas, daFila] : [atribuidas] };
}

export const isSessaoVisivel = (acesso: AcessoDaLista, sessao: SessaoNaLista): boolean =>
  isDaFila(sessao.status) ? acesso.verFila : acesso.verTodas || sessao.assignedAttendantId === acesso.userId;
