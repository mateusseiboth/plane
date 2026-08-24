/**
 * A solicitação acompanha o chamado dela.
 *
 * A triagem e o estado do chamado nasceram como duas trilhas separadas: o time
 * arrastava o cartão até "Concluído" no quadro e o status da solicitação
 * continuava "Pendente", à espera de alguém abrir a triagem, clicar em "Aceitar"
 * e depois em "Marcar como atendido". Ninguém volta lá — o trabalho acontece no
 * quadro —, então a fila de solicitações abertas só crescia, cheia de item cujo
 * trabalho tinha acabado semanas antes. Quem abriu o chamado via "Pendente" para
 * sempre.
 *
 * Aqui as duas trilhas viram uma só: concluiu o chamado, atendeu a solicitação.
 *
 * ## O caminho de volta importa tanto quanto a ida
 *
 * "Devolver para Em Teste" é rotina — conclui, o Qualidade reprova, volta. Por
 * isso sair de "Concluído" reabre a solicitação, e reabre como ACEITA, não como
 * PENDENTE: a triagem já aconteceu e o trabalho está em curso; jogá-la de volta
 * para pendente faria a fila de triagem cobrar de novo um item já triado.
 *
 * ## O que esta função NÃO mexe
 *
 * RECUSADA e DUPLICADA são decisões que alguém tomou de propósito sobre a
 * solicitação, e não sobre o andamento do trabalho. Concluir um chamado marcado
 * como duplicado não desfaz o julgamento de quem o marcou.
 *
 * Cancelado também não atende: "atendido" quer dizer entregue, e cancelar é o
 * oposto disso. O chamado sai do quadro, mas a solicitação continua aberta,
 * porque quem pediu não recebeu.
 */

import prisma from "@db";

/** Espelha `EInboxIssueStatus` de `@plane/types` — o backend não importa o pacote do front. */
const SITUACAO = {
  pendente: -2,
  recusada: -1,
  adiada: 0,
  aceita: 1,
  duplicada: 2,
  atendida: 3,
} as const;

/** Marca de atividade do atendimento automático. Campo desconhecido não desenha nada na trilha da tela. */
const MARCA = "solicitacao_atendida";

/** Quanto do último comentário cabe no registro — o texto inteiro mora no comentário. */
const LIMITE_DO_RESUMO = 500;

/**
 * Decisões que alguém tomou sobre a solicitação em si.
 *
 * O andamento do chamado não as desfaz: um chamado marcado como duplicado segue
 * duplicado depois de concluído, e um recusado segue recusado.
 */
const DECIDIDAS_A_MAO: readonly number[] = [SITUACAO.recusada, SITUACAO.duplicada];

/** Situações que ainda esperam o trabalho terminar. */
const EM_ANDAMENTO: readonly number[] = [SITUACAO.pendente, SITUACAO.adiada, SITUACAO.aceita];

/** Para onde a solicitação vai, dado o grupo em que o chamado entrou. */
const DESTINO: Record<string, (atual: number) => number | null> = {
  completed: (atual) => (EM_ANDAMENTO.includes(atual) ? SITUACAO.atendida : null),
  // Qualquer grupo que não seja conclusão reabre o que tinha fechado sozinho.
  outro: (atual) => (atual === SITUACAO.atendida ? SITUACAO.aceita : null),
};

function destinoDe(grupo: string, atual: number): number | null {
  if (DECIDIDAS_A_MAO.includes(atual)) return null;
  return (DESTINO[grupo] ?? DESTINO.outro)(atual);
}

/** O último comentário do chamado, em texto puro — é ele que conta como o problema foi resolvido. */
async function ultimoComentario(issueId: string): Promise<string | null> {
  const comentario = await prisma.issueComment.findFirst({
    where: { issueId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: { commentStripped: true, commentHtml: true },
  });
  if (!comentario) return null;
  const texto = (comentario.commentStripped ?? comentario.commentHtml ?? "").replace(/<[^>]+>/g, " ");
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo ? limpo.slice(0, LIMITE_DO_RESUMO) : null;
}

type Entrada = {
  issueId: string;
  /** Grupo do estado em que o chamado acabou de entrar (`completed`, `started`, …). */
  grupo: string;
  autorId: string;
  workspaceId: string;
  projectId: string;
};

/**
 * Põe a solicitação no mesmo compasso do chamado.
 *
 * Silenciosa quando não há solicitação, quando a situação não muda, ou quando
 * alguém já decidiu à mão o destino dela.
 */
export async function acompanharSolicitacao({
  issueId,
  grupo,
  autorId,
  workspaceId,
  projectId,
}: Entrada): Promise<void> {
  const solicitacao = await prisma.intakeIssue.findFirst({
    where: { issueId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!solicitacao) return;

  const destino = destinoDe(grupo, solicitacao.status);
  if (destino === null) return;

  await prisma.intakeIssue.update({ where: { id: solicitacao.id }, data: { status: destino } });
  if (destino !== SITUACAO.atendida) return;

  // Guarda COMO foi resolvido junto do atendimento: quem lê a solicitação
  // fechada quer o desfecho, não só a data.
  const desfecho = await ultimoComentario(issueId);
  await prisma.issueActivity.create({
    data: {
      issueId,
      workspaceId,
      projectId,
      actorId: autorId,
      field: MARCA,
      oldValue: String(solicitacao.status),
      newValue: desfecho ?? "atendida sem comentário de desfecho",
      comment: "atendeu a solicitação ao concluir o chamado",
    },
  });
}
