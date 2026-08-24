/**
 * Toda solicitação pede resposta ao concluir — não só a que veio do portal.
 *
 * A primeira versão cobrava só o chamado nascido no portal, porque era ali que o
 * cliente ficava sem retorno. Mas quem abre pela triagem — o atendimento
 * repassando um pedido do telefone, alguém do time abrindo pelo "Adicionar
 * chamado" — está na mesma situação: pediu, esperou, e o chamado fecha em
 * silêncio. Origem da solicitação não muda o fato de haver alguém do outro lado.
 *
 * Então a fila de "responder" passou a ser a das SOLICITAÇÕES (intake), e a
 * origem só decide para ONDE a resposta vai: o portal mostra na conta do
 * cliente; as demais avisam quem abriu.
 */
import { describe, it, expect, beforeAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";
import prisma from "@db";

describe("Responder qualquer solicitação ao concluir", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoId: string;
  let concluido: string;
  let emTeste: string;
  let euId: string;
  let quemPediuId: string;

  const filaDeResposta = async () => {
    const res = await admin.get(`/workspaces/${wsSlug}/portal-answers/pending/`);
    return ((await res.json()) as any).results as any[];
  };

  const mover = (issueId: string, stateId: string) =>
    admin.patch(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issueId}/`, { state: stateId });

  beforeAll(async () => {
    await cleanDb();
    const eu = await createUser();
    euId = eu.id;
    const token = await createApiToken(eu.id);
    admin = apiClient(token.token);
    const ws = await createWorkspace(eu.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const projeto = await createProject(ws.id, eu.id);
    projetoId = projeto.id;

    const quemPediu = await createUser();
    quemPediuId = quemPediu.id;
    await prisma.projectMember.create({
      data: { projectId: projetoId, workspaceId: ws.id, memberId: quemPediu.id, role: 15, isActive: true },
    });

    const estados = await prisma.state.findMany({ where: { projectId: projetoId, deletedAt: null } });
    concluido = estados.find((e) => e.group === "completed")!.id;
    emTeste = estados.find((e) => e.group === "started")!.id;
  });

  it("solicitação aberta pela triagem entra na fila de resposta ao concluir", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, {
      name: "Servidor não emite a guia",
      source: "in-app",
      createdById: quemPediuId,
    });
    expect((await filaDeResposta()).some((p) => p.issue_id === issue.id)).toBe(false);

    await mover(issue.id, concluido);
    const fila = await filaDeResposta();
    const meu = fila.find((p) => p.issue_id === issue.id);
    expect(meu).toBeDefined();
    expect(meu.titulo).toBe("Servidor não emite a guia");
  });

  it("a fila diz de onde veio, para a tela saber o que prometer", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, { source: "in-app", createdById: quemPediuId });
    await mover(issue.id, concluido);
    const meu = (await filaDeResposta()).find((p) => p.issue_id === issue.id);
    expect(meu.origem).toBe("in-app");
  });

  it("responder grava o comentário e tira da fila", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, { source: "in-app", createdById: quemPediuId });
    await mover(issue.id, concluido);

    const res = await admin.post(`/workspaces/${wsSlug}/portal-answers/${issue.id}/`, {
      resposta: "Ajustamos o cadastro do servidor. A guia já emite.",
    });
    expect(res.status).toBe(201);

    expect((await filaDeResposta()).some((p) => p.issue_id === issue.id)).toBe(false);
    const comentario = await prisma.issueComment.findFirst({
      where: { issueId: issue.id, externalSource: "portal_resposta", deletedAt: null },
    });
    expect(comentario).not.toBeNull();
    expect(comentario!.commentStripped).toContain("A guia já emite");
  });

  it("quem abriu a solicitação é avisado da resposta", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, { source: "in-app", createdById: quemPediuId });
    await mover(issue.id, concluido);
    await admin.post(`/workspaces/${wsSlug}/portal-answers/${issue.id}/`, { resposta: "Resolvido." });

    const aviso = await prisma.notification.findFirst({
      where: { issueId: issue.id, receiverId: quemPediuId },
      orderBy: { createdAt: "desc" },
    });
    expect(aviso).not.toBeNull();
    expect(String(aviso!.title)).toMatch(/respost/i);
  });

  it("não avisa quem respondeu a si mesmo", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, { source: "in-app", createdById: euId });
    await mover(issue.id, concluido);
    await admin.post(`/workspaces/${wsSlug}/portal-answers/${issue.id}/`, { resposta: "Eu mesmo abri e resolvi." });

    const aviso = await prisma.notification.findFirst({
      where: { issueId: issue.id, receiverId: euId },
    });
    expect(aviso).toBeNull();
  });

  it("concluir sem responder continua valendo para qualquer origem", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, { source: "in-app", createdById: quemPediuId });
    await mover(issue.id, concluido);
    const res = await admin.post(`/workspaces/${wsSlug}/portal-answers/${issue.id}/`, {
      pular: true,
      motivo: "Falei por telefone.",
    });
    expect(res.status).toBe(201);
    expect((await filaDeResposta()).some((p) => p.issue_id === issue.id)).toBe(false);
  });

  it("devolver para Em Teste e concluir de novo volta a cobrar", async () => {
    const { issue } = await createIntakeIssue(projetoId, wsId, { source: "in-app", createdById: quemPediuId });
    await mover(issue.id, concluido);
    expect((await filaDeResposta()).some((p) => p.issue_id === issue.id)).toBe(true);

    await mover(issue.id, emTeste);
    expect((await filaDeResposta()).some((p) => p.issue_id === issue.id)).toBe(false);

    await mover(issue.id, concluido);
    expect((await filaDeResposta()).some((p) => p.issue_id === issue.id)).toBe(true);
  });

  it("chamado que não nasceu de solicitação nenhuma continua fora da fila", async () => {
    const criado = await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/issues/`, {
      name: "Chamado nascido no quadro",
    });
    const { id } = (await criado.json()) as any;
    await mover(id, concluido);
    expect((await filaDeResposta()).some((p) => p.issue_id === id)).toBe(false);

    const res = await admin.post(`/workspaces/${wsSlug}/portal-answers/${id}/`, { resposta: "oi" });
    expect(res.status).toBe(404);
  });

  it("solicitação aberta pela triagem sabe quem pediu, e a fila mostra o nome", async () => {
    const res = await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/inbox-issues/`, {
      issue: { name: "Pedido do atendimento por telefone" },
    });
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as any;
    const issueId = corpo.issue?.id ?? corpo.id;

    await mover(issueId, concluido);
    const meu = (await filaDeResposta()).find((p) => p.issue_id === issueId);
    expect(meu).toBeDefined();
    // Sem o `createdById` gravado na solicitação, a fila só sabia dizer
    // "Quem abriu a solicitação" e não tinha para quem tocar o sino.
    expect(meu.cliente).not.toBe("Quem abriu a solicitação");
    expect(meu.origem).toBe("in-app");
  });
});
