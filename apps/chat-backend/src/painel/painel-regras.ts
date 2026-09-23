/**
 * Painel de TV do atendimento (as abas do `chatger` do SAC: Em Atendimento,
 * Pausa, Não Iniciado, Espera, Inativo e Fechou Chat).
 *
 * Aqui mora a tradução do nosso ciclo de vida para as abas do legado, e o
 * tempo que cada aba mostra — que NÃO é o mesmo em todas: quem está na fila
 * espera desde que abriu a conversa; quem está em atendimento está parado
 * desde a última mensagem de qualquer lado; quem já encerrou tem duração.
 *
 * Puro: as conversas entram já carregadas (ver `painel.service.ts`).
 */

export const ABAS_DO_PAINEL = [
  { chave: "em_atendimento", rotulo: "Em Atendimento" },
  { chave: "pausa", rotulo: "Pausa" },
  { chave: "nao_iniciado", rotulo: "Não Iniciado" },
  { chave: "espera", rotulo: "Espera" },
  { chave: "inativo", rotulo: "Inativo" },
  { chave: "fechou_chat", rotulo: "Fechou Chat" },
] as const;

export type AbaDoPainel = (typeof ABAS_DO_PAINEL)[number]["chave"];

/** Como o tempo da linha é lido na tela. */
export type TipoDoTempo = "espera" | "parado" | "duracao";

export const TEMPO_DA_ABA: Record<AbaDoPainel, TipoDoTempo> = {
  em_atendimento: "parado",
  pausa: "espera",
  nao_iniciado: "espera",
  espera: "espera",
  inativo: "duracao",
  fechou_chat: "duracao",
};

export type SessaoDoPainel = {
  status: string;
  endKind: string | null;
  createdAt: Date;
  closedAt: Date | null;
  pausedAt: Date | null;
  lastClientMessageAt: Date | null;
  lastAttendantMessageAt: Date | null;
};

/** Encerramentos em que o cliente simplesmente parou de responder. */
const FINS_INATIVOS = new Set(["inatividade", "pausa_vencida", "abandono"]);

const POR_SITUACAO: { quando: (s: SessaoDoPainel) => boolean; aba: AbaDoPainel }[] = [
  { quando: (s) => s.status === "paused", aba: "pausa" },
  { quando: (s) => s.status === "bot" || s.status === "queued", aba: "espera" },
  // Atribuída, mas o atendente ainda não escreveu nada: é o "Não Iniciado" do SAC.
  { quando: (s) => s.status === "active" && s.lastAttendantMessageAt === null, aba: "nao_iniciado" },
  { quando: (s) => s.status === "active", aba: "em_atendimento" },
  { quando: (s) => s.status === "closed" && FINS_INATIVOS.has(s.endKind ?? ""), aba: "inativo" },
  { quando: (s) => s.status === "closed", aba: "fechou_chat" },
];

/** Em que aba a conversa aparece; `null` quando não aparece em nenhuma. */
export function classifyAbaDoPainel(sessao: SessaoDoPainel): AbaDoPainel | null {
  return POR_SITUACAO.find((regra) => regra.quando(sessao))?.aba ?? null;
}

const segundosEntre = (de: Date, ate: Date) => Math.max(0, Math.round((ate.getTime() - de.getTime()) / 1000));

/** Última mensagem de qualquer lado; sem mensagem nenhuma, a abertura. */
export function readUltimaAtividade(sessao: SessaoDoPainel): Date {
  const mensagens = [sessao.lastClientMessageAt, sessao.lastAttendantMessageAt].filter((d): d is Date => d !== null);
  return mensagens.length ? new Date(Math.max(...mensagens.map((d) => d.getTime()))) : sessao.createdAt;
}

const INICIO_DO_TEMPO: Record<TipoDoTempo, (s: SessaoDoPainel) => Date> = {
  espera: (s) => s.pausedAt ?? s.createdAt,
  parado: readUltimaAtividade,
  duracao: (s) => s.createdAt,
};

/** Segundos que a aba mostra para aquela conversa. */
export function readTempoDaLinha(aba: AbaDoPainel, sessao: SessaoDoPainel, agora: Date): number {
  const tipo = TEMPO_DA_ABA[aba];
  const fim = tipo === "duracao" ? (sessao.closedAt ?? agora) : agora;
  return segundosEntre(INICIO_DO_TEMPO[tipo](sessao), fim);
}

/** Como o cliente aparece na coluna "Contato": telefone, e-mail ou o nome. */
export function readContato(sessao: {
  clientPhone: string | null;
  clientEmail?: string | null;
  clientName: string | null;
}): string {
  return sessao.clientPhone?.trim() || sessao.clientEmail?.trim() || sessao.clientName?.trim() || "—";
}

export type AtendenteDoPainel = {
  id: string;
  name: string;
  conectado: boolean;
  invisivel: boolean;
  em_atendimento: number;
  aguardando: number;
};

export const SITUACOES_DO_ATENDENTE = ["online", "invisivel", "offline"] as const;
export type SituacaoDoAtendente = (typeof SITUACOES_DO_ATENDENTE)[number];

/**
 * Conectado e visível é "online"; conectado mas escondido pelo administrador
 * aparece como "invisível" (ele atende, mas a fila não o escolhe); o resto é
 * "offline".
 */
export const readSituacaoDoAtendente = (atendente: { conectado: boolean; invisivel: boolean }): SituacaoDoAtendente => {
  if (!atendente.conectado) return "offline";
  return atendente.invisivel ? "invisivel" : "online";
};

/**
 * A lateral mostra só quem está em alguma fila de atendimento. Quem tem a ação
 * de atender mas não entrou em fila nenhuma nunca recebe conversa distribuída,
 * então sua linha só enchia a TV de "Offline". Vale inclusive para quem está
 * online fora de fila.
 */
export function filterAtendentesEmFila<T extends { id: string }>(atendentes: T[], emFila: ReadonlySet<string>): T[] {
  return atendentes.filter((atendente) => emFila.has(atendente.id));
}

const PESO_DA_SITUACAO: Record<SituacaoDoAtendente, number> = { online: 0, invisivel: 1, offline: 2 };

/** Online primeiro, depois quem tem mais conversa, depois em ordem alfabética. */
export function sortAtendentes(atendentes: AtendenteDoPainel[]): AtendenteDoPainel[] {
  return atendentes.toSorted(
    (a, b) =>
      PESO_DA_SITUACAO[readSituacaoDoAtendente(a)] - PESO_DA_SITUACAO[readSituacaoDoAtendente(b)] ||
      b.em_atendimento - a.em_atendimento ||
      a.name.localeCompare(b.name, "pt-BR")
  );
}
