/**
 * As rotas do `src/index.ts` pela matriz de ações, contra o servidor de pé
 * (CHAT_URL): transferir (`chat.transferir`), a lista de atendimentos
 * (`chat.ver_todas`, `chat.ver_fila`), a avaliação do cliente
 * (`chat.configurar`) e encerrar pelo socket (`chat.encerrar`). A mesma pessoa
 * troca de ações entre os casos (`setAcoesDaFuncao`).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { CHAT_ACTION } from "@/permissoes";
import {
  CHAT_URL,
  cleanWorkspace,
  connectAttendant,
  createPessoaComAcoes,
  ensureAtendenteNoEspaco,
  limparWorkspacePlane,
  resolveTestAttendant,
  setAcoesDaFuncao,
  uniqueWorkspace,
  type PessoaDeTeste,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wsacoese2e");
const { ATENDER, ENCERRAR, TRANSFERIR, VER_TODAS, VER_FILA, CONFIGURAR } = CHAT_ACTION;
let pessoa: PessoaDeTeste;
let colega: string;
const sessao: Record<string, string> = {};

const createSessao = async (status: string, assignedAttendantId: string | null, dados: Record<string, unknown> = {}) =>
  (
    await prisma.chatSession.create({
      data: {
        workspaceId: slug,
        protocol: `AC-${crypto.randomUUID().slice(0, 12)}`,
        channel: "native",
        status,
        botState: "done",
        assignedAttendantId,
        ...dados,
      },
    })
  ).id;

const request = async (metodo: string, caminho: string, corpo?: unknown) => {
  const res = await fetch(`${CHAT_URL}/workspaces/${slug}${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${pessoa.token}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
};

const listIds = async (status?: string) => {
  const res = await request("GET", `/sessions/${status ? `?status=${status}` : ""}`);
  expect(res.status).toBe(200);
  return (res.body.results as Array<{ id: string }>).map((s) => s.id).sort();
};

beforeAll(async () => {
  const quemAtende = await resolveTestAttendant();
  colega = quemAtende.id;
  await ensureAtendenteNoEspaco(slug, colega);
  pessoa = await createPessoaComAcoes(slug, [ATENDER]);
  sessao.minha = await createSessao("active", pessoa.id, { ratingScore: 5 });
  sessao.doColega = await createSessao("active", colega);
  sessao.naFila = await createSessao("queued", null);
  sessao.noRobo = await createSessao("bot", null);
}, 30000);

afterAll(async () => {
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${slug}@teste.local`}`;
});

describe("lista de atendimentos", () => {
  it("só chat.atender: só as próprias", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    expect(await listIds()).toEqual([sessao.minha!]);
    expect(await listIds("queued,bot")).toEqual([]);
  });

  it("com chat.ver_todas: as dos outros também, sem a fila", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, VER_TODAS]);
    expect(await listIds()).toEqual([sessao.minha!, sessao.doColega!].sort());
  });

  it("com chat.ver_fila: as próprias, a fila e o robô", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, VER_FILA]);
    expect(await listIds()).toEqual([sessao.minha!, sessao.naFila!, sessao.noRobo!].sort());
  });

  it("a avaliação do cliente só com chat.configurar", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const sem = (await request("GET", "/sessions/")).body.results.find((s: any) => s.id === sessao.minha);
    expect(sem.rating_score ?? null).toBeNull();
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, CONFIGURAR]);
    const com = (await request("GET", "/sessions/")).body.results.find((s: any) => s.id === sessao.minha);
    expect(com.rating_score).toBe(5);
  });
});

describe("transferir", () => {
  it("sem chat.transferir: 403 em português", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const res = await request("POST", `/sessions/${sessao.doColega}/transfer/`, { to_user_id: pessoa.id });
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/permissão/);
  });

  it("com chat.transferir: transfere", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [TRANSFERIR]);
    const res = await request("POST", `/sessions/${sessao.doColega}/transfer/`, { to_user_id: colega });
    expect(res.status).toBe(200);
    expect(res.body.assigned_attendant_id ?? res.body.assignedAttendantId).toBe(colega);
  });
});

describe("encerrar pelo socket", () => {
  it("sem chat.encerrar o socket recusa; com ela, segue para o encerramento", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const socket = await connectAttendant(slug, pessoa.token);
    try {
      socket.send({ type: "agent.close", session_id: sessao.minha });
      const recusa = await socket.waitFor((e) => e.type === "error" && e.action === "session.close");
      expect(recusa.detail).toMatch(/permissão/);

      await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, ENCERRAR]);
      socket.events.length = 0;
      socket.send({ type: "agent.close", session_id: sessao.minha });
      // Sem entidade a conversa não encerra, mas a recusa agora é do encerramento.
      const seguinte = await socket.waitFor((e) => e.type === "error" && e.action === "session.close");
      expect(seguinte.detail).not.toMatch(/permissão/);
    } finally {
      socket.close();
    }
  });
});
