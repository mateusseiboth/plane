/**
 * Quem vê qual conversa na lista do atendente (`GET /workspaces/:slug/sessions/`).
 *
 * A regra é pela AÇÃO, não pelo papel: quem tem `chat.administrar` vê todas as
 * conversas do espaço, inclusive robô, fila e as que já transferiu para outra
 * pessoa. Os demais (gestor incluído) veem só as atribuídas a si, nunca robô
 * nem fila. É por isso que o administrador continua vendo um atendimento que
 * acabou de transferir, e quem não administra deixa de ver na hora.
 *
 * O filtro do banco e o predicado em memória ficam lado a lado, na mesma
 * estratégia, para não divergirem.
 */

export const ESCOPO_DA_LISTA = { TODAS: "todas", MINHAS: "minhas" } as const;
export type EscopoDaLista = (typeof ESCOPO_DA_LISTA)[keyof typeof ESCOPO_DA_LISTA];

/** Robô e fila: só quem administra enxerga. */
const OCULTOS_DE_QUEM_NAO_ADMINISTRA = ["bot", "queued"];

type SessaoNaLista = { assignedAttendantId?: string | null; status: string };

type Estrategia = {
  buildFiltro: (userId: string, pedidos: string[] | null) => Record<string, unknown>;
  isVisivel: (sessao: SessaoNaLista, userId: string) => boolean;
};

const isStatusAberto = (status: string) => !OCULTOS_DE_QUEM_NAO_ADMINISTRA.includes(status);

const ESTRATEGIAS: Record<EscopoDaLista, Estrategia> = {
  [ESCOPO_DA_LISTA.TODAS]: {
    buildFiltro: (_userId, pedidos) => (pedidos ? { status: { in: pedidos } } : {}),
    isVisivel: () => true,
  },
  [ESCOPO_DA_LISTA.MINHAS]: {
    buildFiltro: (userId, pedidos) => ({
      assignedAttendantId: userId,
      status: pedidos ? { in: pedidos.filter(isStatusAberto) } : { notIn: OCULTOS_DE_QUEM_NAO_ADMINISTRA },
    }),
    isVisivel: (sessao, userId) => sessao.assignedAttendantId === userId && isStatusAberto(sessao.status),
  },
};

export const readEscopoDaLista = (podeAdministrar: boolean): EscopoDaLista =>
  podeAdministrar ? ESCOPO_DA_LISTA.TODAS : ESCOPO_DA_LISTA.MINHAS;

/** O pedaço do `where` que depende de quem pede; `pedidos` é o `?status=` da URL. */
export const buildFiltroDaVisibilidade = (escopo: EscopoDaLista, userId: string, pedidos: string[] | null) =>
  ESTRATEGIAS[escopo].buildFiltro(userId, pedidos);

export const isSessaoVisivel = (escopo: EscopoDaLista, sessao: SessaoNaLista, userId: string): boolean =>
  ESTRATEGIAS[escopo].isVisivel(sessao, userId);
