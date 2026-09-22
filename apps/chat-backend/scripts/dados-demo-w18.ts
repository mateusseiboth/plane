/**
 * Conversas de demonstração do painel do atendimento (W18), no banco plane_w18.
 * Só para a conferência no navegador.
 */
import prisma from "@db";

const SLUG = "quality";
const MIN = 60_000;

const AGORA = Date.now();

type Demo = {
  status: string;
  endKind?: string;
  minutosAtras: number;
  ultimaDoCliente?: number;
  ultimaDoAtendente?: number;
  pausadaHa?: number;
  fechadaHa?: number;
  cliente: string;
  telefone: string;
  sistema: string;
};

const CONVERSAS: Demo[] = [
  {
    status: "active",
    minutosAtras: 42,
    ultimaDoCliente: 4,
    ultimaDoAtendente: 9,
    cliente: "Maria da Prefeitura",
    telefone: "5567999990001",
    sistema: "SIART",
  },
  {
    status: "active",
    minutosAtras: 25,
    ultimaDoCliente: 2,
    ultimaDoAtendente: 18,
    cliente: "João do RH",
    telefone: "5567999990002",
    sistema: "ARH",
  },
  { status: "active", minutosAtras: 12, cliente: "Ana da Câmara", telefone: "5567999990003", sistema: "Contabilidade" },
  { status: "active", minutosAtras: 6, cliente: "Carlos do Almoxarifado", telefone: "5567999990004", sistema: "SIART" },
  {
    status: "queued",
    minutosAtras: 3,
    cliente: "Pedro da Tesouraria",
    telefone: "5567999990005",
    sistema: "Contabilidade",
  },
  { status: "queued", minutosAtras: 21, cliente: "Luciana do Protocolo", telefone: "5567999990006", sistema: "SIART" },
  { status: "bot", minutosAtras: 1, cliente: "Visitante do site", telefone: "5567999990007", sistema: "ARH" },
  {
    status: "paused",
    minutosAtras: 90,
    pausadaHa: 35,
    cliente: "Rita da Saúde",
    telefone: "5567999990008",
    sistema: "ARH",
  },
  {
    status: "closed",
    endKind: "inatividade",
    minutosAtras: 220,
    fechadaHa: 60,
    cliente: "Marcos do Patrimônio",
    telefone: "5567999990009",
    sistema: "SIART",
  },
  {
    status: "closed",
    endKind: "cliente_saiu",
    minutosAtras: 180,
    fechadaHa: 100,
    cliente: "Beatriz da Educação",
    telefone: "5567999990010",
    sistema: "Contabilidade",
  },
  {
    status: "closed",
    endKind: "atendente",
    minutosAtras: 300,
    fechadaHa: 140,
    cliente: "Fernando das Obras",
    telefone: "5567999990011",
    sistema: "SIART",
  },
];

const instante = (minutos: number | undefined) => (minutos === undefined ? null : new Date(AGORA - minutos * MIN));

async function main() {
  const atendentes = (await prisma.$queryRaw`
    SELECT u.id::text AS id FROM users u WHERE u.deleted_at IS NULL ORDER BY u.created_at ASC LIMIT 1`) as Array<{
    id: string;
  }>;
  const atendente = atendentes[0]?.id ?? null;

  const jaTem = await prisma.chatSession.count({ where: { workspaceId: SLUG } });
  if (jaTem >= CONVERSAS.length) {
    console.log(`[demo-chat] ${jaTem} conversas já existem; nada a criar.`);
    return;
  }

  for (const [indice, conversa] of CONVERSAS.entries()) {
    const id = crypto.randomUUID();
    await prisma.chatSession.create({
      data: {
        id,
        protocol: `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(indice + 1).padStart(4, "0")}`,
        channel: indice % 3 === 0 ? "native" : "whatsapp",
        workspaceId: SLUG,
        clientName: conversa.cliente,
        clientPhone: conversa.telefone,
        projectName: conversa.sistema,
        status: conversa.status,
        endKind: conversa.endKind ?? null,
        assignedAttendantId: conversa.status === "active" || conversa.status === "paused" ? atendente : null,
        createdAt: instante(conversa.minutosAtras)!,
        closedAt: instante(conversa.fechadaHa),
        pausedAt: instante(conversa.pausadaHa),
        lastClientMessageAt: instante(conversa.ultimaDoCliente),
        lastAttendantMessageAt: instante(conversa.ultimaDoAtendente),
      } as never,
    });
  }
  console.log(`[demo-chat] ${CONVERSAS.length} conversas criadas.`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
