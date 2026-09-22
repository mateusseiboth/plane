/**
 * O cliente conversa com a solicitação pelo portal: responde enquanto está em
 * andamento, encerra quando já resolveu, avalia ao concluir e reabre com motivo.
 *
 * O que este arquivo cobra:
 *
 *  1. A resposta do cliente vira comentário do chamado (marca `portal_cliente`),
 *     com o nome da conta, e acende o sino dos responsáveis.
 *  2. Encerrar leva o chamado para Concluído e atende a solicitação, sem cobrar
 *     da equipe uma resposta que o cliente dispensou.
 *  3. A avaliação é uma por conclusão e aparece para a equipe no chamado.
 *  4. Reabrir exige motivo, volta o chamado para Em Análise e faz a equipe
 *     responder de novo na próxima conclusão.
 *  5. Nada disso vale para solicitação de outra conta.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { prismaReal } from "@tests/helpers/prisma-real";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

const SENHA = "portal-secreto-123";
const prisma = () => prismaReal();

// Endereço próprio deste arquivo: o limite de login do portal é por IP e fica na
// memória do servidor, então a suíte inteira dividiria as mesmas 10 tentativas.
const IP_DO_TESTE = "10.10.0.2";

function portalClient(token = "") {
  const base = `${TEST_API_BASE_URL}/portal/api`;
  const cabecalhos = () => ({
    "Content-Type": "application/json",
    "X-Forwarded-For": IP_DO_TESTE,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });
  return {
    get: (caminho: string) => fetch(`${base}${caminho}`, { headers: cabecalhos() }),
    post: (caminho: string, body: unknown) =>
      fetch(`${base}${caminho}`, { method: "POST", headers: cabecalhos(), body: JSON.stringify(body) }),
  };
}

describe("Interações do cliente no portal", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoId: string;
  let responsavelId: string;
  let cliente: ReturnType<typeof portalClient>;
  let outroCliente: ReturnType<typeof portalClient>;
  let chamadoId: string;
  let concluidoId: string;

  const criarConta = async (email: string) => {
    const res = await admin.post(`/workspaces/${wsSlug}/portal-accounts/`, {
      name: email === "cliente@prefeitura.test" ? "Prefeitura de Teste" : "Câmara de Teste",
      email,
      password: SENHA,
      project_ids: [projetoId],
    });
    expect(res.status).toBe(201);
    const entrada = await portalClient().post("/entrar", { workspace: wsSlug, email, senha: SENHA });
    return portalClient(((await entrada.json()) as any).token);
  };

  const detalhe = async (id = chamadoId) => {
    const res = await cliente.get(`/solicitacoes/${id}`);
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  };

  const estadoDoChamado = async (id = chamadoId) =>
    (await prisma().issue.findUniqueOrThrow({ where: { id }, include: { state: true } })).state?.name;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    admin = apiClient((await createApiToken(user.id)).token);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    projetoId = (await createProject(ws.id, user.id, { name: "SIART", identifier: "SIART" })).id;
    // A fábrica cria os estados em inglês; o destino do cliente é pelos nomes do produto.
    const doProjeto = { projectId: projetoId, workspaceId: ws.id };
    await prisma().state.createMany({
      data: [
        { ...doProjeto, name: "Em Análise", group: "started", sequence: 20000, color: "#eab308", slug: "em-analise" },
        { ...doProjeto, name: "Concluído", group: "completed", sequence: 55000, color: "#16a34a", slug: "concluido" },
      ],
    });
    concluidoId = (await prisma().state.findFirstOrThrow({ where: { projectId: projetoId, name: "Concluído" } })).id;

    cliente = await criarConta("cliente@prefeitura.test");
    outroCliente = await criarConta("camara@teste.test");

    const aberta = await cliente.post("/solicitacoes", {
      sistema_id: projetoId,
      titulo: "Erro ao emitir guia",
      descricao_html: "<p>Dá erro.</p>",
    });
    chamadoId = ((await aberta.json()) as any).id;

    // Quem trabalha no chamado: é ele que o sino tem de alcançar.
    const responsavel = await createMemberWithToken(ws.id, 15, projetoId);
    responsavelId = responsavel.user.id;
    await prisma().issueAssignee.create({
      data: { issueId: chamadoId, assigneeId: responsavelId, projectId: projetoId, workspaceId: ws.id },
    });
  });

  afterAll(() => cleanDb());

  describe("responder", () => {
    it("em andamento, a solicitação oferece responder e encerrar", async () => {
      const dados = await detalhe();
      expect(dados.acoes).toEqual({ responder: true, reabrir: false, encerrar: true, avaliar: false });
      expect(dados.interacoes).toEqual([]);
    });

    it("recusa resposta vazia com o erro no campo", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/interacoes`, { texto_html: "<p> </p>" });
      expect(res.status).toBe(400);
      const corpo = (await res.json()) as any;
      expect(corpo.errors).toEqual([{ path: "texto_html", message: expect.any(String) }]);
    });

    it("grava a resposta como comentário do chamado e avisa o responsável", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/interacoes`, {
        texto_html: "<p>Continua dando <b>erro</b>.</p>",
      });
      expect(res.status).toBe(201);
      const interacao = (await res.json()) as any;
      expect(interacao).toMatchObject({ autor: "cliente", nome: "Prefeitura de Teste" });

      const comentario = await prisma().issueComment.findUniqueOrThrow({ where: { id: interacao.id } });
      expect(comentario.externalSource).toBe("portal_cliente");
      expect(comentario.access).toBe("EXTERNAL");
      expect(comentario.actorId).toBeNull();
      expect(comentario.commentHtml).toBe("<p>Continua dando <strong>erro</strong>.</p>");

      const aviso = await prisma().notification.findFirst({
        where: { receiverId: responsavelId, issueId: chamadoId, triggered: "comment" },
      });
      expect(aviso?.title).toBe("O cliente respondeu");
    });

    it("a equipe vê o comentário com o nome da conta do portal", async () => {
      const res = await admin.get(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${chamadoId}/comments/`);
      const comentarios = ((await res.json()) as any).results;
      const doCliente = comentarios.find((c: any) => c.external_source === "portal_cliente");
      expect(doCliente.actor_detail.display_name).toBe("Prefeitura de Teste (cliente)");
    });

    it("a conversa aparece no detalhe do cliente", async () => {
      const dados = await detalhe();
      expect(dados.interacoes).toHaveLength(1);
      expect(dados.interacoes[0]).toMatchObject({ autor: "cliente", tipo: "interacao" });
      expect(dados.interacoes[0].texto_html).toContain("Continua dando");
    });

    it("anexo da resposta conta no limite da resposta, não no da abertura", async () => {
      const interacaoId = (await detalhe()).interacoes[0].id;
      const corpo = new FormData();
      corpo.append("arquivo", new Blob(["log do erro"], { type: "text/plain" }), "erro.txt");
      corpo.append("interacao", interacaoId);
      const res = await fetch(`${TEST_API_BASE_URL}/portal/api/solicitacoes/${chamadoId}/anexos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${await tokenDe("cliente@prefeitura.test")}` },
        body: corpo,
      });
      expect(res.status).toBe(201);
      const anexo = await prisma().issueAttachment.findFirstOrThrow({ where: { issueId: chamadoId } });
      expect((anexo.attributes as any).interacao).toBe(interacaoId);
    });

    it("outra conta não responde nem encerra o que não é dela", async () => {
      expect(
        (await outroCliente.post(`/solicitacoes/${chamadoId}/interacoes`, { texto_html: "<p>oi</p>" })).status
      ).toBe(404);
      expect((await outroCliente.post(`/solicitacoes/${chamadoId}/encerrar`, {})).status).toBe(404);
      expect((await outroCliente.post(`/solicitacoes/${chamadoId}/reabrir`, { motivo: "quero" })).status).toBe(404);
      expect(
        (await outroCliente.post(`/solicitacoes/${chamadoId}/avaliacao`, { nota_atendimento: 3, expectativa: 4 }))
          .status
      ).toBe(404);
    });

    it("reabrir o que não está concluído é recusado", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/reabrir`, { motivo: "Ainda não" });
      expect(res.status).toBe(409);
    });
  });

  describe("encerrar e avaliar", () => {
    it("encerrar leva o chamado para Concluído e atende a solicitação", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/encerrar`, { motivo: "Resolvi aqui." });
      expect(res.status).toBe(200);
      expect(await estadoDoChamado()).toBe("Concluído");
      const solicitacao = await prisma().intakeIssue.findFirstOrThrow({ where: { issueId: chamadoId } });
      expect(solicitacao.status).toBe(3);

      const dados = (await res.json()) as any;
      expect(dados.acoes).toEqual({ responder: false, reabrir: true, encerrar: false, avaliar: true });
      expect(dados.interacoes.at(-1)).toMatchObject({ tipo: "encerramento", autor: "cliente" });
    });

    it("encerrado pelo cliente não cobra resposta da equipe", async () => {
      const token = (await createApiToken(responsavelId)).token;
      const res = await apiClient(token).get(`/workspaces/${wsSlug}/portal-answers/pending/`);
      const ids = ((await res.json()) as any).results.map((r: any) => r.issue_id);
      expect(ids).not.toContain(chamadoId);
    });

    it("responder depois de concluída é recusado", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/interacoes`, { texto_html: "<p>oi</p>" });
      expect(res.status).toBe(409);
    });

    it("avaliação incompleta volta no campo", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/avaliacao`, { nota_atendimento: 3 });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).errors.map((e: any) => e.path)).toEqual(["expectativa"]);
    });

    it("avalia uma vez; a segunda é recusada", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/avaliacao`, {
        nota_atendimento: 1,
        expectativa: 2,
        comentario: "Demorou.",
      });
      expect(res.status).toBe(201);
      const dados = (await res.json()) as any;
      expect(dados.avaliacao).toMatchObject({
        nota_atendimento: 1,
        nota_atendimento_rotulo: "Ruim",
        expectativa: 2,
        expectativa_rotulo: "Não",
        comentario: "Demorou.",
      });
      expect(dados.acoes.avaliar).toBe(false);

      const segunda = await cliente.post(`/solicitacoes/${chamadoId}/avaliacao`, {
        nota_atendimento: 3,
        expectativa: 4,
      });
      expect(segunda.status).toBe(409);
    });

    it("a equipe lê a avaliação no chamado", async () => {
      const res = await admin.get(`/workspaces/${wsSlug}/portal-requests/${chamadoId}/`);
      expect(res.status).toBe(200);
      const dados = (await res.json()) as any;
      expect(dados.account).toMatchObject({ name: "Prefeitura de Teste", email: "cliente@prefeitura.test" });
      expect(dados.evaluations).toHaveLength(1);
      expect(dados.evaluations[0]).toMatchObject({
        service_rating: 1,
        service_rating_label: "Ruim",
        expectation: 2,
        expectation_label: "Não",
        comment: "Demorou.",
        is_current: true,
      });
    });

    it("chamado que não veio do portal responde 404 na leitura interna", async () => {
      const interno = await prisma().issue.create({
        data: { projectId: projetoId, workspaceId: wsId, name: "Interno", sequenceId: 999 },
      });
      const res = await admin.get(`/workspaces/${wsSlug}/portal-requests/${interno.id}/`);
      expect(res.status).toBe(404);
    });

    it("quem não participa do sistema não lê a avaliação", async () => {
      const deFora = await createMemberWithToken(wsId, 15);
      const res = await apiClient(deFora.token).get(`/workspaces/${wsSlug}/portal-requests/${chamadoId}/`);
      expect([403, 404]).toContain(res.status);
    });
  });

  describe("reabrir", () => {
    it("exige o motivo, no campo", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/reabrir`, { motivo: "  " });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).errors).toEqual([{ path: "motivo", message: expect.any(String) }]);
    });

    it("volta o chamado para Em Análise, com o motivo na conversa e o sino do responsável", async () => {
      const res = await cliente.post(`/solicitacoes/${chamadoId}/reabrir`, { motivo: "Voltou a dar erro." });
      expect(res.status).toBe(200);
      expect(await estadoDoChamado()).toBe("Em Análise");
      const solicitacao = await prisma().intakeIssue.findFirstOrThrow({ where: { issueId: chamadoId } });
      expect(solicitacao.status).toBe(1);

      const dados = (await res.json()) as any;
      expect(dados.acoes).toEqual({ responder: true, reabrir: false, encerrar: true, avaliar: false });
      expect(dados.interacoes.at(-1)).toMatchObject({ tipo: "reabertura" });
      expect(dados.interacoes.at(-1).texto_html).toContain("Voltou a dar erro.");

      const aviso = await prisma().notification.findFirst({
        where: { receiverId: responsavelId, issueId: chamadoId, title: "O cliente reabriu a solicitação" },
      });
      expect(aviso).not.toBeNull();
    });

    it("a avaliação anterior fica no histórico, e a próxima conclusão pede resposta e avaliação de novo", async () => {
      const concluiu = await admin.patch(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${chamadoId}`, {
        state_id: concluidoId,
        assignee_ids: [responsavelId],
      });
      expect(concluiu.status).toBe(200);

      const token = (await createApiToken(responsavelId)).token;
      const pendentes = await apiClient(token).get(`/workspaces/${wsSlug}/portal-answers/pending/`);
      const ids = ((await pendentes.json()) as any).results.map((r: any) => r.issue_id);
      expect(ids).toContain(chamadoId);

      expect((await detalhe()).acoes.avaliar).toBe(true);
      const interno = (await (await admin.get(`/workspaces/${wsSlug}/portal-requests/${chamadoId}/`)).json()) as any;
      expect(interno.evaluations).toHaveLength(1);
      expect(interno.evaluations[0].is_current).toBe(false);
    });
  });

  /** Token de uma conta do portal, para quem precisa montar o multipart na mão. */
  async function tokenDe(email: string): Promise<string> {
    const entrada = await portalClient().post("/entrar", { workspace: wsSlug, email, senha: SENHA });
    return ((await entrada.json()) as any).token;
  }
});
