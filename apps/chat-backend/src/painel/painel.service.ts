/**
 * Painel de TV do atendimento: as seis abas do `chatger` do SAC e a lateral de
 * atendentes, montados para uma tela de parede.
 *
 * Duas leituras (conversas do dia + conversas abertas) e agregação em memória,
 * como o monitor ao vivo já faz. Ligação (`channel = "phone"`) fica de fora: do
 * outro lado não há ninguém digitando, e a TV mede espera de conversa.
 *
 * A porta de entrada é interna (`src/painel/rotas.ts`): quem chama é o api-ts,
 * que já autenticou a chave do painel.
 */

import prisma from "@db";
import type { Prisma } from "@generated/prisma";
import { findEntidadesPorId } from "@/atendente/plane.dao";
import { WITHOUT_PHONE } from "@/canais";
import {
  ABAS_DO_PAINEL,
  classifyAbaDoPainel,
  readContato,
  readSituacaoDoAtendente,
  readTempoDaLinha,
  sortAtendentes,
  TEMPO_DA_ABA,
  type AbaDoPainel,
  type AtendenteDoPainel,
} from "@/painel/painel-regras";
import { listAtendentes } from "@/permissoes";
import { inicioDoDiaNoFuso } from "@/presence";
import { attendantName } from "@/users";
import { connectedUserIds } from "@/ws/hub";

const CAMPOS = {
  id: true,
  protocol: true,
  channel: true,
  status: true,
  clientName: true,
  clientPhone: true,
  contact: { select: { email: true } },
  entityId: true,
  projectName: true,
  assignedAttendantId: true,
  endKind: true,
  createdAt: true,
  closedAt: true,
  pausedAt: true,
  lastClientMessageAt: true,
  lastAttendantMessageAt: true,
} satisfies Prisma.ChatSessionSelect;

type Linha = Prisma.ChatSessionGetPayload<{ select: typeof CAMPOS }>;

/**
 * As conversas que o painel mostra: as que estão vivas agora (em qualquer
 * situação) e as que encerraram HOJE, no fuso do espaço.
 */
function findConversas(slug: string, inicioDoDia: Date): Promise<Linha[]> {
  return prisma.chatSession.findMany({
    where: {
      workspaceId: slug,
      ...WITHOUT_PHONE,
      OR: [{ status: { not: "closed" } }, { closedAt: { gte: inicioDoDia } }],
    },
    select: CAMPOS,
    orderBy: { createdAt: "asc" },
  });
}

async function readNomes(linhas: Linha[]) {
  const atendentes = [...new Set(linhas.map((l) => l.assignedAttendantId).filter((id): id is string => !!id))];
  const entidades = [...new Set(linhas.map((l) => l.entityId).filter((id): id is string => !!id))];
  const [porAtendente, porEntidade] = await Promise.all([
    Promise.all(atendentes.map(async (id) => [id, await attendantName(id)] as const)),
    findEntidadesPorId(entidades),
  ]);
  return { atendentes: new Map(porAtendente), entidades: porEntidade };
}

type Nomes = Awaited<ReturnType<typeof readNomes>>;

function serializeLinha(linha: Linha, aba: AbaDoPainel, nomes: Nomes, agora: Date) {
  return {
    id: linha.id,
    protocolo: linha.protocol,
    canal: linha.channel,
    aberto_em: linha.createdAt.toISOString(),
    contato: readContato({
      clientPhone: linha.clientPhone,
      clientEmail: linha.contact?.email ?? null,
      clientName: linha.clientName,
    }),
    cliente: linha.clientName,
    entidade: linha.entityId ? (nomes.entidades.get(linha.entityId) ?? null) : null,
    sistema: linha.projectName,
    atendente: linha.assignedAttendantId ? (nomes.atendentes.get(linha.assignedAttendantId) ?? null) : null,
    tempo_seg: readTempoDaLinha(aba, linha, agora),
    tempo_tipo: TEMPO_DA_ABA[aba],
  };
}

const soma = (mapa: Map<string, number>, id: string) => mapa.set(id, (mapa.get(id) ?? 0) + 1);

/** Quantas conversas cada atendente tem na mão, e em quantas o cliente espera. */
function countPorAtendente(linhas: Linha[]) {
  const emAtendimento = new Map<string, number>();
  const aguardando = new Map<string, number>();
  for (const linha of linhas) {
    const id = linha.assignedAttendantId;
    if (!id || linha.status === "closed") continue;
    soma(emAtendimento, id);
    const cliente = linha.lastClientMessageAt?.getTime() ?? 0;
    const atendente = linha.lastAttendantMessageAt?.getTime() ?? 0;
    if (cliente > atendente) soma(aguardando, id);
  }
  return { emAtendimento, aguardando };
}

export async function readPainelDeAtendimento(slug: string, agora = new Date()) {
  const inicioDoDia = await inicioDoDiaNoFuso(slug);
  const [linhas, equipe] = await Promise.all([findConversas(slug, inicioDoDia), listAtendentes(slug)]);
  const nomes = await readNomes(linhas);

  const classificadas = linhas.map((linha) => ({ linha, aba: classifyAbaDoPainel(linha) }));
  const abas = ABAS_DO_PAINEL.map((aba) => {
    const daAba = classificadas.filter((c) => c.aba === aba.chave);
    return {
      chave: aba.chave,
      rotulo: aba.rotulo,
      total: daAba.length,
      linhas: daAba
        .map((c) => serializeLinha(c.linha, aba.chave, nomes, agora))
        .toSorted((a, b) => b.tempo_seg - a.tempo_seg),
    };
  });

  const conectados = connectedUserIds(slug);
  const invisiveis = new Set(
    (
      await prisma.attendantStatus.findMany({
        where: { workspaceId: slug, isInvisible: true },
        select: { userId: true },
      })
    ).map((s) => s.userId)
  );
  const contagens = countPorAtendente(linhas);
  const atendentes: AtendenteDoPainel[] = equipe.map((pessoa) => ({
    id: pessoa.id,
    name: pessoa.name,
    conectado: conectados.has(pessoa.id),
    invisivel: invisiveis.has(pessoa.id),
    em_atendimento: contagens.emAtendimento.get(pessoa.id) ?? 0,
    aguardando: contagens.aguardando.get(pessoa.id) ?? 0,
  }));

  return {
    gerado_em: agora.toISOString(),
    abas,
    atendentes: sortAtendentes(atendentes).map((a) => ({
      id: a.id,
      name: a.name,
      situacao: readSituacaoDoAtendente(a),
      em_atendimento: a.em_atendimento,
      aguardando: a.aguardando,
    })),
    totais: {
      abertas: classificadas.filter((c) => c.linha.status !== "closed").length,
      encerradas_hoje: classificadas.filter((c) => c.linha.status === "closed").length,
      atendentes_online: atendentes.filter((a) => readSituacaoDoAtendente(a) === "online").length,
    },
  };
}
