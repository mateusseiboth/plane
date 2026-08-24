/**
 * A solicitação fecha sozinha quando o chamado dela é concluído.
 *
 * A triagem e o estado do chamado eram duas trilhas separadas: arrastar o cartão
 * até "Concluído" no quadro nunca tocava no status da solicitação, que ficava
 * "Pendente" para sempre à espera de alguém clicar em "Aceitar" e depois em
 * "Marcar como atendido". Na prática ninguém volta lá — o time trabalha no
 * quadro —, então a fila de solicitações abertas só crescia, com itens cujo
 * trabalho terminou há semanas.
 *
 * Aqui a solicitação acompanha o chamado: concluiu, atendeu. E o caminho de
 * volta importa tanto quanto a ida, porque devolver para "Em Teste" é rotina.
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

const PENDENTE = -2;
const RECUSADA = -1;
const ADIADA = 0;
const ACEITA = 1;
const DUPLICADA = 2;
const ATENDIDA = 3;

describe("Solicitação atendida ao concluir o chamado", () => {
  let admin: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let projetoId: string;
  let concluido: string;
  let emTeste: string;
  let cancelado: string;
  let usuarioId: string;

  const statusDa = async (linkId: string) =>
    (await prisma.intakeIssue.findFirst({ where: { id: linkId }, select: { status: true } }))?.status;

  const mover = (issueId: string, stateId: string) =>
    admin.patch(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issueId}/`, { state: stateId });

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    usuarioId = dono.id;
    const token = await createApiToken(dono.id);
    admin = apiClient(token.token);
    const ws = await createWorkspace(dono.id);
    wsSlug = ws.slug;
    wsId = ws.id;
    const projeto = await createProject(ws.id, dono.id);
    projetoId = projeto.id;

    const estados = await prisma.state.findMany({ where: { projectId: projetoId, deletedAt: null } });
    concluido = estados.find((e) => e.group === "completed")!.id;
    cancelado = estados.find((e) => e.group === "cancelled")!.id;
    emTeste = estados.find((e) => e.group === "started")!.id;
  });

  it("concluir o chamado marca a solicitação como atendida", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: PENDENTE, createdById: usuarioId });
    expect(await statusDa(link.id)).toBe(PENDENTE);

    const res = await mover(issue.id, concluido);
    expect(res.status).toBe(200);
    expect(await statusDa(link.id)).toBe(ATENDIDA);
  });

  it("solicitação já aceita também fecha", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: ACEITA, createdById: usuarioId });
    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(ATENDIDA);
  });

  it("solicitação adiada fecha junto — o trabalho terminou", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: ADIADA, createdById: usuarioId });
    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(ATENDIDA);
  });

  it("devolver para Em Teste reabre a solicitação como aceita, não como pendente", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: PENDENTE, createdById: usuarioId });
    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(ATENDIDA);

    await mover(issue.id, emTeste);
    // Aceita, e não pendente: a triagem já aconteceu, o trabalho está em curso.
    expect(await statusDa(link.id)).toBe(ACEITA);

    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(ATENDIDA);
  });

  it("cancelar o chamado NÃO marca como atendida — atendido é entrega, cancelado não é", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: ACEITA, createdById: usuarioId });
    await mover(issue.id, cancelado);
    expect(await statusDa(link.id)).toBe(ACEITA);
  });

  it("solicitação recusada continua recusada mesmo que o chamado conclua", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: RECUSADA, createdById: usuarioId });
    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(RECUSADA);
  });

  it("solicitação marcada como duplicada continua duplicada", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: DUPLICADA, createdById: usuarioId });
    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(DUPLICADA);
  });

  it("o atendimento fica registrado com quem concluiu e com o último comentário", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: ACEITA, createdById: usuarioId });
    await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issue.id}/comments/`, {
      comment_html: "<p>Primeiro apontamento.</p>",
    });
    await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issue.id}/comments/`, {
      comment_html: "<p>Feito o ajuste no cálculo do rodapé.</p>",
    });

    await mover(issue.id, concluido);
    expect(await statusDa(link.id)).toBe(ATENDIDA);

    const marca = await prisma.issueActivity.findFirst({
      where: { issueId: issue.id, field: "solicitacao_atendida", deletedAt: null },
    });
    expect(marca).not.toBeNull();
    expect(marca!.actorId).toBe(usuarioId);
    // O último comentário, não o primeiro: é ele que conta como foi resolvido.
    expect(marca!.newValue).toContain("Feito o ajuste");
    expect(marca!.newValue).not.toContain("Primeiro apontamento");
  });

  it("chamado sem solicitação nenhuma conclui normalmente", async () => {
    const criado = await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/issues/`, {
      name: "Chamado nascido no quadro",
    });
    expect(criado.status).toBe(201);
    const { id } = (await criado.json()) as any;
    const res = await mover(id, concluido);
    expect(res.status).toBe(200);
    expect(await prisma.intakeIssue.count({ where: { issueId: id } })).toBe(0);
  });

  it("concluir pela triagem fecha a solicitação igual a concluir pelo quadro", async () => {
    const { issue, link } = await createIntakeIssue(projetoId, wsId, { status: ACEITA, createdById: usuarioId });
    const res = await admin.patch(`/workspaces/${wsSlug}/projects/${projetoId}/intake-work-items/${issue.id}/`, {
      state: concluido,
    });
    expect(res.status).toBe(200);
    expect(await statusDa(link.id)).toBe(ATENDIDA);
  });

  it("concluir em massa fecha as solicitações dos chamados do lote", async () => {
    const a = await createIntakeIssue(projetoId, wsId, { status: PENDENTE, createdById: usuarioId });
    const b = await createIntakeIssue(projetoId, wsId, { status: ACEITA, createdById: usuarioId });
    const res = await admin.post(`/workspaces/${wsSlug}/projects/${projetoId}/issues/bulk-update/`, {
      issue_ids: [a.issue.id, b.issue.id],
      state: concluido,
    });
    expect(res.status).toBe(200);
    expect(await statusDa(a.link.id)).toBe(ATENDIDA);
    expect(await statusDa(b.link.id)).toBe(ATENDIDA);
  });

  /**
   * Apagar o chamado apagava só o chamado: a solicitação continuava viva e
   * seguia aparecendo como "Pendente" numa fila que ninguém mais consegue
   * atender, porque o chamado por trás dela não existe mais.
   */
  describe("chamado apagado não deixa solicitação órfã", () => {
    const listarTriagem = async () => {
      const res = await admin.get(`/workspaces/${wsSlug}/projects/${projetoId}/inbox-issues/`);
      const corpo = (await res.json()) as any;
      return (corpo.results ?? corpo) as any[];
    };

    it("apagar o chamado tira a solicitação da fila", async () => {
      const { issue } = await createIntakeIssue(projetoId, wsId, { status: PENDENTE, createdById: usuarioId });
      const antes = await listarTriagem();
      expect(antes.some((i) => i.issue?.id === issue.id)).toBe(true);

      const res = await admin.delete(`/workspaces/${wsSlug}/projects/${projetoId}/issues/${issue.id}`);
      expect([200, 204]).toContain(res.status);

      const depois = await listarTriagem();
      expect(depois.some((i) => i.issue?.id === issue.id)).toBe(false);
    });

    it("solicitação de chamado apagado por fora também some da fila", async () => {
      const { issue } = await createIntakeIssue(projetoId, wsId, { status: ACEITA, createdById: usuarioId });
      // Apaga só o chamado, deixando o vínculo vivo — é o estado em que os
      // registros antigos ficaram antes desta correção.
      await prisma.issue.update({ where: { id: issue.id }, data: { deletedAt: new Date() } });

      const lista = await listarTriagem();
      expect(lista.some((i) => i.issue?.id === issue.id)).toBe(false);
    });
  });
});
