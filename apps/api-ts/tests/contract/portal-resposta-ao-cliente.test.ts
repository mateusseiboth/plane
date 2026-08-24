/**
 * Resposta ao cliente quando o chamado que ele abriu no portal é concluído.
 *
 * O que este arquivo cobra:
 *
 *  1. Só chamado de ORIGEM PORTAL entra na fila de resposta — o resto do quadro
 *     conclui como sempre concluiu, sem nada novo.
 *  2. A pendência é DERIVADA do estado (origem portal + grupo `completed` + sem
 *     resposta + sem dispensa), então qualquer caminho de conclusão a produz.
 *  3. A resposta é OPCIONAL: dá para concluir sem responder, mas isso é um ato
 *     explícito e fica registrado — não é o silêncio de antes.
 *  4. O cliente lê a resposta na consulta dele, com autor e data.
 *  5. Tudo isso deixa trilha LGPD: é conteúdo saindo para fora da aplicação.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";

const SENHA = "portal-secreto-123";

function portalClient(token = "") {
  const base = `${TEST_API_BASE_URL}/portal/api`;
  const cabecalhos = () => ({
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  return {
    get: (caminho: string) => fetch(`${base}${caminho}`, { headers: cabecalhos() }),
    post: (caminho: string, body: unknown) =>
      fetch(`${base}${caminho}`, { method: "POST", headers: cabecalhos(), body: JSON.stringify(body) }),
  };
}

/** A trilha é gravada sem `await` no caminho da requisição — vale insistir um pouco. */
async function esperarTrilha(buscar: () => Promise<any[]>, tentativas = 20): Promise<any[]> {
  for (let i = 0; i < tentativas; i++) {
    const linhas = await buscar();
    if (linhas.length) return linhas;
    await new Promise((r) => setTimeout(r, 100));
  }
  return [];
}

describe("Resposta ao cliente do portal", () => {
  let admin: ReturnType<typeof apiClient>;
  let colega: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoId: string;
  let concluidoId: string;
  let cliente: string;

  /** Abre uma solicitação pelo portal e devolve o id do chamado gerado. */
  async function abrirPeloPortal(titulo: string): Promise<string> {
    const res = await portalClient(cliente).post("/solicitacoes", { sistema_id: projetoId, titulo });
    expect(res.status).toBe(201);
    return ((await res.json()) as any).id;
  }

  /** Conclui o chamado pelo caminho normal do produto: PATCH do estado. */
  async function concluir(issueId: string, client = admin) {
    const res = await client.patch(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issueId}`, {
      state_id: concluidoId,
    });
    expect(res.status).toBe(200);
  }

  async function pendentes(client = admin): Promise<any[]> {
    const res = await client.get(`/workspaces/${wsSlug}/portal-answers/pending/`);
    expect(res.status).toBe(200);
    return ((await res.json()) as any).results;
  }

  async function responder(issueId: string, corpo: unknown, client = admin) {
    return client.post(`/workspaces/${wsSlug}/portal-answers/${issueId}/`, corpo);
  }

  async function solicitacaoDoCliente(issueId: string) {
    const res = await portalClient(cliente).get(`/solicitacoes/${issueId}`);
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  }

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    admin = apiClient((await createApiToken(user.id)).token);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const projeto = await createProject(ws.id, user.id, { name: "SIART", identifier: "SIART" });
    projetoId = projeto.id;
    concluidoId = (await prismaReal().state.findFirstOrThrow({ where: { projectId: projetoId, group: "completed" } }))
      .id;

    // Um segundo membro do projeto, que NÃO trabalha nos chamados do teste.
    const outro = await createUser();
    await prismaReal().projectMember.create({
      data: { projectId: projetoId, workspaceId: ws.id, memberId: outro.id, role: 20, isActive: true },
    });
    colega = apiClient((await createApiToken(outro.id)).token);

    await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
      name: "Prefeitura de Teste",
      email: "cliente@prefeitura.test",
      password: SENHA,
      project_ids: [projetoId],
    });
    const entrada = await portalClient().post("/entrar", {
      workspace: wsSlug,
      email: "cliente@prefeitura.test",
      senha: SENHA,
    });
    cliente = ((await entrada.json()) as any).token;
  });

  afterAll(() => cleanDb());

  it("solicitação recém-aberta não pede resposta: ninguém concluiu nada", async () => {
    const chamado = await abrirPeloPortal("Não consigo emitir a segunda via");
    expect((await pendentes()).map((p) => p.issue_id)).not.toContain(chamado);
  });

  it("recusa responder enquanto o chamado não está concluído", async () => {
    const chamado = await abrirPeloPortal("Ainda em andamento");
    const res = await responder(chamado, { resposta: "Já resolvemos." });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).detail).toContain("concluído");
  });

  it("concluir um chamado do portal põe a resposta na fila de quem concluiu", async () => {
    const chamado = await abrirPeloPortal("Boleto com valor errado");
    await concluir(chamado);

    const fila = await pendentes();
    const pendencia = fila.find((p) => p.issue_id === chamado);
    expect(pendencia).toBeTruthy();
    expect(pendencia.codigo).toStartWith("SIART-");
    expect(pendencia.codigo).not.toBe("SIART-0");
    expect(pendencia.titulo).toBe("Boleto com valor errado");
    expect(pendencia.cliente).toBe("Prefeitura de Teste");
    expect(pendencia.project_id).toBe(projetoId);

    // Quem não trabalha no chamado não é cobrado por ele.
    expect((await pendentes(colega)).map((p: any) => p.issue_id)).not.toContain(chamado);
  });

  it("quem escolhe responder precisa escrever alguma coisa", async () => {
    const chamado = await abrirPeloPortal("Sem texto");
    await concluir(chamado);
    const res = await responder(chamado, { resposta: "   " });
    expect(res.status).toBe(400);
    // E continua pendente: recusar o vazio não é o mesmo que dispensar.
    expect((await pendentes()).map((p) => p.issue_id)).toContain(chamado);
  });

  it("a resposta gravada aparece para o cliente, com quem respondeu e quando", async () => {
    const chamado = await abrirPeloPortal("Certidão não sai");
    await concluir(chamado);

    const texto = "Corrigimos o cadastro do imóvel.\n\nA certidão já pode ser emitida.";
    const res = await responder(chamado, { resposta: texto });
    expect(res.status).toBe(201);

    const solicitacao = await solicitacaoDoCliente(chamado);
    expect(solicitacao.resposta).toBeTruthy();
    expect(solicitacao.resposta.texto).toBe(texto);
    expect(solicitacao.resposta.respondida_por).toBeTruthy();
    expect(solicitacao.resposta.respondida_em).toBeTruthy();

    // Sai da fila e não aceita uma segunda resposta pelo mesmo caminho.
    expect((await pendentes()).map((p) => p.issue_id)).not.toContain(chamado);
    expect((await responder(chamado, { resposta: "de novo" })).status).toBe(409);
  });

  it("a resposta fica no histórico do chamado, como comentário externo", async () => {
    const chamado = await abrirPeloPortal("Fica no histórico");
    await concluir(chamado);
    expect((await responder(chamado, { resposta: "Resolvido no servidor." })).status).toBe(201);

    const res = await admin.get(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${chamado}/comments/`);
    const comentarios = ((await res.json()) as any).results;
    expect(comentarios.length).toBe(1);
    expect(comentarios[0].access).toBe("EXTERNAL");
    expect(comentarios[0].comment_html).toContain("Resolvido no servidor.");
  });

  it("a resposta é opcional: dá para concluir sem responder, e isso fica registrado", async () => {
    const chamado = await abrirPeloPortal("Duplicado do outro");
    await concluir(chamado);

    const res = await responder(chamado, { pular: true, motivo: "Já respondido por telefone." });
    expect(res.status).toBe(201);
    expect(((await res.json()) as any).dispensada).toBe(true);

    // Sai da fila (não vira alarme permanente) e o cliente segue sem resposta.
    expect((await pendentes()).map((p) => p.issue_id)).not.toContain(chamado);
    expect((await solicitacaoDoCliente(chamado)).resposta).toBeNull();

    const marca = await prismaReal().issueActivity.findFirst({
      where: { issueId: chamado, field: "portal_resposta" },
    });
    expect(marca?.newValue).toBe("dispensada");
    expect(marca?.oldValue).toBe("Já respondido por telefone.");
    expect(marca?.actorId).toBeTruthy();
  });

  it("chamado que NÃO veio do portal não muda em nada ao ser concluído", async () => {
    const criado = await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/issues/`, {
      name: "Tarefa interna da equipe",
    });
    expect(criado.status).toBe(201);
    const chamado = ((await criado.json()) as any).id;
    await concluir(chamado);

    expect((await pendentes()).map((p) => p.issue_id)).not.toContain(chamado);
    const res = await responder(chamado, { resposta: "não deveria passar" });
    expect(res.status).toBe(404);
    expect(await prismaReal().issueComment.count({ where: { issueId: chamado } })).toBe(0);
  });

  it("a resposta e a dispensa entram na trilha de auditoria (LGPD)", async () => {
    const respondido = await abrirPeloPortal("Auditar a resposta");
    await concluir(respondido);
    expect((await responder(respondido, { resposta: "Ajustamos a alíquota." })).status).toBe(201);

    const dispensado = await abrirPeloPortal("Auditar a dispensa");
    await concluir(dispensado);
    expect((await responder(dispensado, { pular: true })).status).toBe(201);

    const trilhaDaResposta = await esperarTrilha(() =>
      prismaReal().auditLog.findMany({
        where: { workspaceId: wsId, entityId: respondido, action: "comment" },
      })
    );
    expect(trilhaDaResposta.length).toBe(1);
    const meta = trilhaDaResposta[0].metadata as any;
    expect(meta.origem).toBe("portal");
    expect(meta.resposta_ao_cliente).toBe("enviada");
    expect(meta.conta_id).toBeTruthy();
    // A trilha guarda o tamanho, nunca o texto que foi para o cliente.
    expect(meta.caracteres).toBe("Ajustamos a alíquota.".length);
    expect(JSON.stringify(meta)).not.toContain("alíquota");
    expect(trilhaDaResposta[0].actorId).toBeTruthy();

    const trilhaDaDispensa = await esperarTrilha(() =>
      prismaReal().auditLog.findMany({
        where: { workspaceId: wsId, entityId: dispensado, action: "update" },
      })
    );
    expect(trilhaDaDispensa.some((l: any) => l.metadata?.resposta_ao_cliente === "dispensada")).toBe(true);
  });

  it("quem não pode comentar no projeto não responde ao cliente", async () => {
    const chamado = await abrirPeloPortal("De fora do projeto");
    await concluir(chamado);
    const estranho = apiClient((await createApiToken((await createUser()).id)).token);
    const res = await responder(chamado, { resposta: "oi" }, estranho);
    expect([401, 403, 404]).toContain(res.status);
  });
});
