/**
 * Quem entra numa conversa pelas rotas que não levam o espaço na URL: histórico
 * (`GET /sessions/:id/messages/`), transcrição pelo protocolo
 * (`GET /sessions/by-protocol/:protocol/`), anexo (`POST /sessions/:id/upload/`)
 * e avaliação (`POST /sessions/:id/rate/`).
 *
 * O cliente entra com o token da própria conversa. A equipe precisa atender no
 * espaço da conversa (`chat.atender`) e enxergá-la pela regra da lista
 * (`isSessaoVisivel`): as próprias sempre, as dos outros com `chat.ver_todas`,
 * fila e robô com `chat.ver_fila`. A transcrição pelo protocolo é exceção: abre
 * para quem atende no espaço da conversa, sem a regra da lista, porque chega
 * pelo link do chamado. A avaliação é só do cliente.
 *
 * Contra o servidor de pé (CHAT_URL); a mesma pessoa troca de ações entre os
 * casos (`setAcoesDaFuncao`).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { signClientToken } from "@/auth";
import { CHAT_ACTION } from "@/permissoes";
import {
  CHAT_URL,
  cleanWorkspace,
  createPessoaComAcoes,
  criarWorkspacePlane,
  limparWorkspacePlane,
  setAcoesDaFuncao,
  uniqueWorkspace,
  type PessoaDeTeste,
} from "@tests/helpers/harness";

const slug = uniqueWorkspace("wssessao");
const outroSlug = uniqueWorkspace("wsoutro");
const { ATENDER, VER_TODAS, VER_FILA } = CHAT_ACTION;
const TODAS = Object.values(CHAT_ACTION);

let pessoa: PessoaDeTeste;
let colega: PessoaDeTeste;
let deOutroEspaco: PessoaDeTeste;
const sessao: Record<string, { id: string; protocol: string; token: string }> = {};

const createSessao = async (status: string, assignedAttendantId: string | null) => {
  const criada = await prisma.chatSession.create({
    data: {
      workspaceId: slug,
      protocol: `AS-${crypto.randomUUID().slice(0, 12)}`,
      channel: "native",
      status,
      botState: "done",
      assignedAttendantId,
      clientBrowserId: crypto.randomUUID(),
    },
  });
  return { id: criada.id, protocol: criada.protocol, token: await signClientToken(criada.id, criada.clientBrowserId!) };
};

type Resposta = { status: number; body: any };

const send = async (caminho: string, init: RequestInit = {}, bearer?: string): Promise<Resposta> => {
  const res = await fetch(`${CHAT_URL}${caminho}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const readHistorico = (sessionId: string, bearer?: string, token?: string) =>
  send(`/sessions/${sessionId}/messages/${token ? `?token=${encodeURIComponent(token)}` : ""}`, {}, bearer);

const readTranscricao = (protocol: string, bearer?: string) => send(`/sessions/by-protocol/${protocol}/`, {}, bearer);

const sendAvaliacao = (sessionId: string, score: number, opcoes: { bearer?: string; token?: string } = {}) =>
  send(
    `/sessions/${sessionId}/rate/${opcoes.token ? `?token=${encodeURIComponent(opcoes.token)}` : ""}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score, comment: "teste" }),
    },
    opcoes.bearer
  );

const uploadAnexo = (sessionId: string, opcoes: { bearer?: string; token?: string } = {}) => {
  const form = new FormData();
  form.append("file", new File(["conteudo"], "anexo.txt", { type: "text/plain" }));
  return send(
    `/sessions/${sessionId}/upload/${opcoes.token ? `?token=${encodeURIComponent(opcoes.token)}` : ""}`,
    { method: "POST", body: form },
    opcoes.bearer
  );
};

const readNota = async (sessionId: string) =>
  (await prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } })).ratingScore;

beforeAll(async () => {
  await criarWorkspacePlane(slug);
  await criarWorkspacePlane(outroSlug);
  pessoa = await createPessoaComAcoes(slug, [ATENDER]);
  colega = await createPessoaComAcoes(slug, [ATENDER]);
  // Tem todas as ações, mas no espaço dele: não é membro do espaço das conversas.
  deOutroEspaco = await createPessoaComAcoes(outroSlug, TODAS);
  sessao.minha = await createSessao("active", pessoa.id);
  sessao.encerradaMinha = await createSessao("closed", pessoa.id);
  sessao.doColega = await createSessao("active", colega.id);
  sessao.naFila = await createSessao("queued", null);
}, 30000);

afterAll(async () => {
  await cleanWorkspace(slug);
  await limparWorkspacePlane(slug);
  await limparWorkspacePlane(outroSlug);
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${slug}@teste.local`}`;
  await prisma.$executeRaw`DELETE FROM users WHERE email LIKE ${`%-${outroSlug}@teste.local`}`;
});

describe("avaliação: só o cliente avalia", () => {
  it("o cliente, com o token da conversa, grava a nota", async () => {
    const res = await sendAvaliacao(sessao.encerradaMinha!.id, 4, { token: sessao.encerradaMinha!.token });
    expect(res.status).toBe(200);
    expect(res.body.rating_score).toBe(4);
    expect(await readNota(sessao.encerradaMinha!.id)).toBe(4);
  });

  it("o atendente da conversa recebe 403 e a nota do cliente fica como estava", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, TODAS);
    const res = await sendAvaliacao(sessao.encerradaMinha!.id, 1, { bearer: pessoa.token });
    expect(res.status).toBe(403);
    expect(res.body.detail).toBe("Só o cliente avalia o atendimento.");
    expect(await readNota(sessao.encerradaMinha!.id)).toBe(4);
  });

  it("o token do cliente de outra conversa não avalia esta", async () => {
    const res = await sendAvaliacao(sessao.encerradaMinha!.id, 1, { token: sessao.doColega!.token });
    expect(res.status).toBe(403);
    expect(await readNota(sessao.encerradaMinha!.id)).toBe(4);
  });
});

describe("histórico da conversa", () => {
  it("o cliente lê pelo token da própria conversa", async () => {
    const res = await readHistorico(sessao.minha!.id, undefined, sessao.minha!.token);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessao.minha!.id);
  });

  it("sem login nem token: 401", async () => {
    expect((await readHistorico(sessao.minha!.id)).status).toBe(401);
  });

  it("o atendente da conversa lê", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const res = await readHistorico(sessao.minha!.id, pessoa.token);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessao.minha!.id);
  });

  it("sem chat.atender no espaço: 403", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [VER_TODAS, VER_FILA]);
    const res = await readHistorico(sessao.minha!.id, pessoa.token);
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/permissão/);
  });

  it("a conversa de outro atendente, sem chat.ver_todas: 404", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const res = await readHistorico(sessao.doColega!.id, pessoa.token);
    expect(res.status).toBe(404);
    expect(res.body.detail).toBe("Atendimento não encontrado.");
  });

  it("a conversa de outro atendente, com chat.ver_todas: lê", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, VER_TODAS]);
    expect((await readHistorico(sessao.doColega!.id, pessoa.token)).status).toBe(200);
  });

  it("a fila só com chat.ver_fila", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, VER_TODAS]);
    expect((await readHistorico(sessao.naFila!.id, pessoa.token)).status).toBe(404);
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER, VER_FILA]);
    expect((await readHistorico(sessao.naFila!.id, pessoa.token)).status).toBe(200);
  });

  it("quem é de outro espaço não lê, nem tendo todas as ações no dele", async () => {
    const res = await readHistorico(sessao.minha!.id, deOutroEspaco.token);
    expect([403, 404]).toContain(res.status);
  });
});

describe("transcrição pelo protocolo", () => {
  it("o atendente da conversa abre", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const res = await readTranscricao(sessao.minha!.protocol, pessoa.token);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessao.minha!.id);
  });

  it("sem login: 401", async () => {
    expect((await readTranscricao(sessao.minha!.protocol)).status).toBe(401);
  });

  it("o token do cliente não abre a transcrição da equipe", async () => {
    const res = await send(
      `/sessions/by-protocol/${sessao.minha!.protocol}/?token=${encodeURIComponent(sessao.minha!.token)}`
    );
    expect(res.status).toBe(401);
  });

  // O protocolo chega pelo link "Ver conversa" do chamado: quem atende o chamado
  // (TI, Qualidade) abre a conversa de outra pessoa sem precisar de chat.ver_todas.
  it("a conversa de outro atendente, sem chat.ver_todas: abre", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const res = await readTranscricao(sessao.doColega!.protocol, pessoa.token);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(sessao.doColega!.id);
  });

  it("a conversa na fila, sem chat.ver_fila: abre", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    expect((await readTranscricao(sessao.naFila!.protocol, pessoa.token)).status).toBe(200);
  });

  it("sem chat.atender no espaço: 403", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [VER_TODAS, VER_FILA]);
    const res = await readTranscricao(sessao.minha!.protocol, pessoa.token);
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/permissão/);
  });

  it("quem é de outro espaço: 403, nem tendo todas as ações no dele", async () => {
    expect((await readTranscricao(sessao.minha!.protocol, deOutroEspaco.token)).status).toBe(403);
  });

  it("protocolo que não existe: 404", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    expect((await readTranscricao("NAO-EXISTE-0000", pessoa.token)).status).toBe(404);
  });
});

describe("anexo da conversa", () => {
  it("o cliente anexa com o token da conversa", async () => {
    const res = await uploadAnexo(sessao.minha!.id, { token: sessao.minha!.token });
    expect(res.status).toBe(200);
    expect(res.body.media_key).toStartWith(`${sessao.minha!.id}/`);
  });

  it("o atendente da conversa anexa", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    expect((await uploadAnexo(sessao.minha!.id, { bearer: pessoa.token })).status).toBe(200);
  });

  it("sem login nem token: 401", async () => {
    expect((await uploadAnexo(sessao.minha!.id)).status).toBe(401);
  });

  it("na conversa de outro atendente, sem chat.ver_todas: 404", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    expect((await uploadAnexo(sessao.doColega!.id, { bearer: pessoa.token })).status).toBe(404);
  });

  it("quem é de outro espaço não anexa", async () => {
    const res = await uploadAnexo(sessao.minha!.id, { bearer: deOutroEspaco.token });
    expect([403, 404]).toContain(res.status);
  });
});

describe("iniciar conversa de WhatsApp", () => {
  const startWhatsapp = async (bearer: string) => {
    const contato = await prisma.contact.create({
      data: { workspaceId: slug, name: "Contato", phone: `5567${Math.floor(100000000 + Math.random() * 899999999)}` },
    });
    return send(
      `/workspaces/${slug}/sessions/whatsapp/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contato.id }),
      },
      bearer
    );
  };

  it("sem chat.atender no espaço: 403", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [VER_TODAS]);
    const res = await startWhatsapp(pessoa.token);
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/permissão/);
  });

  it("quem é de outro espaço: 403", async () => {
    expect((await startWhatsapp(deOutroEspaco.token)).status).toBe(403);
  });

  it("com chat.atender: abre a conversa atribuída a quem iniciou", async () => {
    await setAcoesDaFuncao(pessoa.funcaoId, [ATENDER]);
    const res = await startWhatsapp(pessoa.token);
    expect(res.status).toBe(200);
    expect(res.body.assigned_attendant_id).toBe(pessoa.id);
  });
});
