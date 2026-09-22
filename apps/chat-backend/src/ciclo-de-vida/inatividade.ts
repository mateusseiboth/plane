/**
 * Inatividade do cliente, nos dois momentos da conversa:
 *
 *  - no robô ou na fila: pergunta aos 10 minutos e encerra 10 minutos depois
 *    (abandono na fila, tipo 3);
 *  - em atendimento: o atendente escreveu e o cliente sumiu. Aos 10 minutos o
 *    robô pergunta "1 continua, 99 encerra" (`zapi/buscaCliAbandonouResp.php`)
 *    e, sem resposta em mais 10, encerra como abandono por inatividade (tipo 5).
 *
 * Ligação (`channel = "phone"`, W06) não é conversa escrita: fica de fora.
 */

import prisma from "@db";
import { CAUSA_DO_FIM } from "@/ciclo-de-vida/abandono";
import { closeAtendimento } from "@/ciclo-de-vida/encerrar";
import {
  PRAZO_DE_INATIVIDADE_MS,
  RESPOSTA_DE_INATIVIDADE,
  type RespostaDeInatividade,
  isAguardandoCliente,
  isPerguntaVencida,
  parseRespostaDeInatividade,
} from "@/ciclo-de-vida/inatividade-regras";
import { persistAndBroadcast } from "@/messages";
import { deliverOutbound } from "@/outbound";
import { runInSequence } from "@/sequencia";

const CANAIS_SEM_INATIVIDADE = ["phone"];

const PERGUNTA_DO_ROBO = "Você ainda precisa de ajuda?";
const PERGUNTA_EM_ATENDIMENTO =
  "Você não responde há mais de 10 minutos. Digite *1* para continuar o atendimento ou *99* para encerrar.";
const ENCERRAMENTO_POR_INATIVIDADE = "Atendimento encerrado por inatividade. Protocolo: {protocol}";
const NAO_ENTENDI = "Não entendi. Digite *1* para continuar o atendimento ou *99* para encerrar.";
const CLIENTE_CONTINUOU = "O cliente respondeu à pergunta de inatividade e quer continuar o atendimento.";
const CLIENTE_ENCERROU = "Agradecemos seu contato. O atendimento foi encerrado. Protocolo: {protocol}";

const SELECT = {
  id: true,
  workspaceId: true,
  protocol: true,
  channel: true,
  clientPhone: true,
  status: true,
  createdAt: true,
  lastClientMessageAt: true,
  lastAttendantMessageAt: true,
  idlePromptedAt: true,
} as const;

type Sessao = {
  id: string;
  workspaceId: string;
  channel: string;
  clientPhone: string | null;
  createdAt: Date;
  lastClientMessageAt: Date | null;
  lastAttendantMessageAt: Date | null;
  idlePromptedAt: Date | null;
};

const readConfig = (workspaceId: string) =>
  prisma.botConfig.findUnique({
    where: { workspaceId },
    select: { idlePromptMessage: true, idleCloseMessage: true, activeIdlePromptMessage: true },
  });

async function askCliente(s: Sessao, texto: string) {
  await deliverOutbound(s, { sender: "bot", type: "text", text: texto });
  await prisma.chatSession.update({ where: { id: s.id }, data: { idlePromptedAt: new Date() } });
}

async function closeInativa(s: Sessao) {
  const cfg = await readConfig(s.workspaceId);
  await closeAtendimento({
    sessionId: s.id,
    causa: CAUSA_DO_FIM.INATIVIDADE,
    mensagem: cfg?.idleCloseMessage ?? ENCERRAMENTO_POR_INATIVIDADE,
  });
}

/** Robô e fila: a última atividade é a do cliente (ou a abertura). */
async function checkRoboEFila(s: Sessao, agora: number) {
  if (isPerguntaVencida(s, agora)) return closeInativa(s);
  if (s.idlePromptedAt) return;
  const ultima = (s.lastClientMessageAt ?? s.createdAt).getTime();
  if (agora - ultima <= PRAZO_DE_INATIVIDADE_MS) return;
  const cfg = await readConfig(s.workspaceId);
  await askCliente(s, cfg?.idlePromptMessage ?? PERGUNTA_DO_ROBO);
}

/** Em atendimento: só conta o silêncio depois da mensagem do atendente. */
async function checkEmAtendimento(s: Sessao, agora: number) {
  if (isPerguntaVencida(s, agora)) return closeInativa(s);
  if (s.idlePromptedAt || !isAguardandoCliente(s, agora)) return;
  const cfg = await readConfig(s.workspaceId);
  await askCliente(s, cfg?.activeIdlePromptMessage ?? PERGUNTA_EM_ATENDIMENTO);
}

const VERIFICACAO_POR_STATUS: Record<string, (s: Sessao, agora: number) => Promise<unknown>> = {
  bot: checkRoboEFila,
  queued: checkRoboEFila,
  active: checkEmAtendimento,
};

/** Uma passada do timer. `workspaceId` restringe a um espaço (testes). */
export async function runInatividade(agora = Date.now(), workspaceId?: string) {
  const sessoes = await prisma.chatSession.findMany({
    where: {
      status: { in: Object.keys(VERIFICACAO_POR_STATUS) },
      channel: { notIn: CANAIS_SEM_INATIVIDADE },
      ...(workspaceId ? { workspaceId } : {}),
    },
    select: SELECT,
  });
  await runInSequence(sessoes, (s) => VERIFICACAO_POR_STATUS[s.status]!(s, agora), "inatividade");
}

type Resposta = (s: Sessao & { status: string }) => Promise<void>;

const RESPOSTAS: Record<RespostaDeInatividade, Resposta> = {
  [RESPOSTA_DE_INATIVIDADE.ENCERRAR]: async (s) => {
    await closeAtendimento({ sessionId: s.id, causa: CAUSA_DO_FIM.CLIENTE_ENCERROU, mensagem: CLIENTE_ENCERROU });
  },
  [RESPOSTA_DE_INATIVIDADE.CONTINUAR]: async (s) => {
    await prisma.chatSession.update({ where: { id: s.id }, data: { idlePromptedAt: null } });
    await persistAndBroadcast({ sessionId: s.id, sender: "system", type: "event", text: CLIENTE_CONTINUOU });
  },
  // A mensagem do cliente já chegou ao atendente (foi gravada antes); só repete a pergunta.
  [RESPOSTA_DE_INATIVIDADE.INVALIDA]: async (s) => {
    await deliverOutbound(s, { sender: "bot", type: "text", text: NAO_ENTENDI });
  },
};

/**
 * Resposta do cliente à pergunta feita em atendimento. Devolve `false` quando
 * não havia pergunta pendente: aí a mensagem é conversa comum com o atendente.
 */
export async function handleRespostaDeInatividade(sessionId: string, texto: string): Promise<boolean> {
  const s = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: SELECT });
  if (!s || s.status !== "active" || !s.idlePromptedAt) return false;
  await RESPOSTAS[parseRespostaDeInatividade(texto)](s);
  return true;
}
