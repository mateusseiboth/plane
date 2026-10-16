/**
 * `POST /workspaces/:slug/projects/:project_id/issues/:issue_id/alterar-sistema/`
 *
 * O chamado não troca de sistema no lugar: o antigo vai para Cancelados e
 * aponta para um novo, aberto no destino com tudo o que o antigo tinha
 * (descrição, prioridade, entidade, datas, etiquetas por nome, responsáveis,
 * comentários com autor e data, anexos, versões, números e a solicitação de
 * origem). Os dois ficam relacionados e cada um registra no histórico de onde
 * veio ou para onde foi. Exige `issue.change_system` (matriz de ações, com
 * exceção por pessoa) no sistema atual e participação no destino.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { existsSync } from "fs";
import path from "path";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { saveAsset } from "@utils/storage";
import { cleanDb } from "@tests/helpers/setup";
import {
  addMember,
  apiClient,
  createApiToken,
  createEntity,
  createIssue,
  createLabel,
  createProject,
  createUser,
  createWorkspace,
  ensureIntake,
} from "@tests/helpers/factory";

type Cliente = ReturnType<typeof apiClient>;

let wsSlug: string;
let wsId: string;
let origemId: string;
let destinoId: string;
let semCanceladosId: string;
let donoId: string;
let admin: Cliente;
let membro: { id: string; api: Cliente };
let ti: { id: string; api: Cliente };

const rota = (projeto: string, chamado: string) =>
  `/workspaces/${wsSlug}/projects/${projeto}/issues/${chamado}/alterar-sistema/`;

const etapaDe = async (projectId: string, name: string) =>
  (await prisma.state.findFirstOrThrow({ where: { projectId, name, deletedAt: null } })).id;

const createPessoa = async (role: number, projetos: string[]) => {
  const user = await createUser();
  await addMember(wsId, user.id, role);
  await prisma.projectMember.createMany({
    data: projetos.map((projectId) => ({ projectId, workspaceId: wsId, memberId: user.id, role, isActive: true })),
  });
  return { id: user.id, api: apiClient((await createApiToken(user.id)).token) };
};

const createChamadoSimples = async (projectId: string, name: string) =>
  createIssue(projectId, wsId, {
    name,
    sequenceId: (await prisma.issue.count({ where: { projectId } })) + 1,
    stateId: await etapaDe(projectId, "Todo"),
  });

/** A trilha LGPD é gravada sem `await` na rota: espera ela chegar. */
async function waitAuditoria(entityId: string, metadataKey: string) {
  // Espera de propósito em série: cada volta só acontece se a anterior não achou.
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    // oxlint-disable-next-line no-await-in-loop
    const logs = await prisma.auditLog.findMany({ where: { entityId } });
    const achado = logs.find((l) => (l.metadata as Record<string, unknown>)?.[metadataKey] !== undefined);
    if (achado) return achado;
    // oxlint-disable-next-line no-await-in-loop
    await Bun.sleep(100);
  }
  return null;
}

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser({ displayName: "Dona do Espaço" });
  donoId = dono.id;
  const ws = await createWorkspace(dono.id);
  wsSlug = ws.slug;
  wsId = ws.id;
  origemId = (await createProject(wsId, dono.id, { identifier: "INTEG", name: "Integração" })).id;
  destinoId = (await createProject(wsId, dono.id, { identifier: "SIART", name: "Siart" })).id;
  semCanceladosId = (await createProject(wsId, dono.id, { identifier: "SEMC", name: "Sem cancelados" })).id;
  await prisma.state.deleteMany({ where: { projectId: semCanceladosId, group: "cancelled" } });
  await seedWorkflowRoles(prisma, wsId);
  admin = apiClient((await createApiToken(dono.id)).token);
  membro = await createPessoa(15, [origemId, destinoId]);
  ti = await createPessoa(12, [origemId]);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("alterar sistema: o chamado completo", () => {
  let antigo: Awaited<ReturnType<typeof createIssue>>;
  let novoId: string;
  let resposta: any;
  let anexoAntigoId: string;
  let etiquetaErroDoDestinoId: string;
  const comentadoEm = new Date("2026-03-04T10:00:00.000Z");

  beforeAll(async () => {
    const entidade = await createEntity(wsId, { name: "Prefeitura de Itu" });
    antigo = await prisma.issue.create({
      data: {
        projectId: origemId,
        workspaceId: wsId,
        sequenceId: 24,
        name: "Relatório da folha não fecha",
        descriptionHtml: "<p>texto editado</p>",
        descriptionStripped: "texto editado",
        descriptionJson: { type: "doc" },
        priority: "high",
        stateId: await etapaDe(origemId, "In Progress"),
        entityId: entidade.id,
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        targetDate: new Date("2026-03-20T18:00:00.000Z"),
        legacyTicketNumber: "2292-2025",
        externalSource: "chat",
        externalId: "sessao-1",
        createdById: membro.id,
      },
    });

    const erroDaOrigem = await createLabel(origemId, wsId, { name: "Erro", color: "#f00" });
    const exclusiva = await createLabel(origemId, wsId, { name: "Exclusiva", color: "#0f0" });
    etiquetaErroDoDestinoId = (await createLabel(destinoId, wsId, { name: "erro", color: "#111" })).id;
    await prisma.issueLabel.createMany({
      data: [erroDaOrigem.id, exclusiva.id].map((labelId) => ({
        issueId: antigo.id,
        labelId,
        projectId: origemId,
        workspaceId: wsId,
      })),
    });
    await prisma.issueAssignee.createMany({
      data: [donoId, membro.id].map((assigneeId) => ({
        issueId: antigo.id,
        assigneeId,
        projectId: origemId,
        workspaceId: wsId,
      })),
    });

    const pai = await prisma.issueComment.create({
      data: {
        issueId: antigo.id,
        projectId: origemId,
        workspaceId: wsId,
        actorId: membro.id,
        createdById: membro.id,
        commentHtml: "<p>primeiro</p>",
        createdAt: comentadoEm,
        access: "EXTERNAL",
      },
    });
    await prisma.issueComment.create({
      data: {
        issueId: antigo.id,
        projectId: origemId,
        workspaceId: wsId,
        actorId: donoId,
        createdById: donoId,
        commentHtml: "<p>resposta</p>",
        parentId: pai.id,
        createdAt: new Date(comentadoEm.getTime() + 60_000),
      },
    });

    anexoAntigoId = (
      await prisma.fileAsset.create({
        data: {
          workspaceId: wsId,
          projectId: origemId,
          entityType: 2,
          entityId: antigo.id,
          asset: `issues/${antigo.id}/print.png`,
          size: 4,
          mimeType: "image/png",
          attributes: { name: "print.png", type: "image/png", size: 4 },
          isUploaded: true,
        },
      })
    ).id;
    await saveAsset(anexoAntigoId, new Blob(["abcd"]));
    await prisma.issueAttachment.create({
      data: {
        issueId: antigo.id,
        projectId: origemId,
        workspaceId: wsId,
        asset: anexoAntigoId,
        attributes: { name: "print.png", type: "image/png", size: 4 },
      },
    });

    await prisma.issueVersion.create({
      data: {
        issueId: antigo.id,
        projectId: origemId,
        workspaceId: wsId,
        lastSavedAt: new Date("2026-03-02T00:00:00.000Z"),
        descriptionHtml: "<p>texto pedido</p>",
        name: "Relatório não fecha",
        ownedById: donoId,
      },
    });
    const intake = await ensureIntake(origemId, wsId);
    await prisma.intakeIssue.create({
      data: {
        intakeId: intake.id,
        issueId: antigo.id,
        projectId: origemId,
        workspaceId: wsId,
        status: 1,
        createdById: membro.id,
      },
    });

    const res = await admin.post(rota(origemId, antigo.id), { project_id_destino: destinoId });
    expect(res.status).toBe(201);
    resposta = await res.json();
    novoId = resposta.id;
  });

  it("devolve o chamado novo no destino, com o identificador para navegar", () => {
    expect(resposta).toMatchObject({
      project_id: destinoId,
      sequence_id: 1,
      project_identifier: "SIART",
      issue: { id: novoId, project_id: destinoId, name: "Relatório da folha não fecha" },
    });
  });

  it("o novo leva texto, prioridade, entidade, datas, números, origem e autor", async () => {
    const novo = await prisma.issue.findUniqueOrThrow({ where: { id: novoId } });
    const velho = await prisma.issue.findUniqueOrThrow({ where: { id: antigo.id } });
    expect(novo).toMatchObject({
      projectId: destinoId,
      sequenceId: 1,
      name: antigo.name,
      descriptionHtml: antigo.descriptionHtml,
      descriptionStripped: antigo.descriptionStripped,
      descriptionJson: { type: "doc" },
      priority: "high",
      entityId: antigo.entityId,
      startDate: antigo.startDate,
      targetDate: antigo.targetDate,
      legacyTicketNumber: "2292-2025",
      ticketSequence: velho.ticketSequence,
      ticketYear: velho.ticketYear,
      externalSource: "chat",
      externalId: "sessao-1",
      createdById: membro.id,
      stateId: await etapaDe(destinoId, "In Progress"),
    });
  });

  it("o antigo vai para Cancelados, aponta para o novo e deixa a conversa do chat para ele", async () => {
    const velho = await prisma.issue.findUniqueOrThrow({ where: { id: antigo.id } });
    expect(velho.stateId).toBe(await etapaDe(origemId, "Cancelled"));
    expect(velho.movedToIssueId).toBe(novoId);
    expect(velho.externalSource).toBeNull();
    expect(velho.externalId).toBeNull();
  });

  it("etiquetas casam por nome: reaproveita a do destino e cria a que falta", async () => {
    const vinculos = await prisma.issueLabel.findMany({
      where: { issueId: novoId, deletedAt: null },
      include: { label: true },
    });
    const porNome = Object.fromEntries(vinculos.map((v) => [v.label.name, v.label]));
    expect(Object.keys(porNome).toSorted()).toEqual(["Exclusiva", "erro"]);
    expect(porNome.erro!.id).toBe(etiquetaErroDoDestinoId);
    expect(porNome.Exclusiva).toMatchObject({ projectId: destinoId, color: "#0f0" });
  });

  it("os responsáveis vão junto", async () => {
    const responsaveis = await prisma.issueAssignee.findMany({ where: { issueId: novoId, deletedAt: null } });
    expect(responsaveis.map((r) => r.assigneeId).toSorted()).toEqual([donoId, membro.id].toSorted());
  });

  it("os comentários vão com autor, data, visibilidade e a resposta presa ao pai", async () => {
    const comentarios = await prisma.issueComment.findMany({
      where: { issueId: novoId },
      orderBy: { createdAt: "asc" },
    });
    expect(comentarios.map((c) => [c.commentHtml, c.actorId])).toEqual([
      ["<p>primeiro</p>", membro.id],
      ["<p>resposta</p>", donoId],
    ]);
    expect(comentarios[0]!.createdAt).toEqual(comentadoEm);
    expect(comentarios[0]!.access).toBe("EXTERNAL");
    expect(comentarios[1]!.parentId).toBe(comentarios[0]!.id);
  });

  it("o anexo é copiado: registro novo e arquivo novo no storage", async () => {
    const anexos = await prisma.issueAttachment.findMany({ where: { issueId: novoId, deletedAt: null } });
    expect(anexos).toHaveLength(1);
    expect(anexos[0]!.asset).not.toBe(anexoAntigoId);
    expect(anexos[0]!.attributes).toMatchObject({ name: "print.png" });
    const arquivo = await prisma.fileAsset.findUniqueOrThrow({ where: { id: anexos[0]!.asset } });
    expect(arquivo).toMatchObject({ entityId: novoId, projectId: destinoId, mimeType: "image/png", isUploaded: true });
    expect(existsSync(path.join(process.env.MEDIA_ROOT!, arquivo.id))).toBe(true);
  });

  it("as versões da descrição vão junto, e o painel da solicitação mostra o texto pedido", async () => {
    expect(await prisma.issueVersion.count({ where: { issueId: novoId } })).toBe(1);
    const res = await admin.get(`/workspaces/${wsSlug}/projects/${destinoId}/issues/${novoId}/`);
    expect(res.status).toBe(200);
    const chamado = (await res.json()) as any;
    expect(chamado.solicitacao).toMatchObject({
      descricao_html: "<p>texto pedido</p>",
      is_texto_atual: false,
      origem: "chat",
    });
  });

  it("a solicitação de origem passa a apontar para o novo, na triagem do destino", async () => {
    const vinculo = await prisma.intakeIssue.findFirstOrThrow({ where: { createdById: membro.id, deletedAt: null } });
    expect(vinculo).toMatchObject({ issueId: novoId, projectId: destinoId });
    const caixa = await prisma.intake.findUniqueOrThrow({ where: { id: vinculo.intakeId } });
    expect(caixa.projectId).toBe(destinoId);
  });

  it("os dois ficam relacionados", async () => {
    const relacao = await prisma.issueRelation.findFirst({
      where: { issueId: antigo.id, relatedIssueId: novoId, deletedAt: null },
    });
    expect(relacao?.relationType).toBe("relates_to");
  });

  it("o histórico de cada um diz para onde foi e de onde veio", async () => {
    const doAntigo = await prisma.issueActivity.findMany({ where: { issueId: antigo.id } });
    expect(doAntigo.find((a) => a.field === "moved_to")?.newValue).toBe("SIART-1");
    expect(doAntigo.find((a) => a.field === "state")).toMatchObject({ oldValue: "In Progress", newValue: "Cancelled" });
    const doNovo = await prisma.issueActivity.findMany({ where: { issueId: novoId } });
    expect(doNovo.find((a) => a.field === "moved_from")?.newValue).toBe("INTEG-24");
  });

  it("o GET dos dois traz o outro lado para o selo", async () => {
    const velho = (await (
      await admin.get(`/workspaces/${wsSlug}/projects/${origemId}/issues/${antigo.id}/`)
    ).json()) as any;
    expect(velho.moved_to_issue).toEqual({
      id: novoId,
      project_id: destinoId,
      sequence_id: 1,
      project_identifier: "SIART",
    });
    expect(velho.moved_from_issue).toBeNull();
    const novo = (await (await admin.get(`/workspaces/${wsSlug}/work-items/SIART-1/`)).json()) as any;
    expect(novo.moved_from_issue).toEqual({
      id: antigo.id,
      project_id: origemId,
      sequence_id: 24,
      project_identifier: "INTEG",
    });
    expect(novo.moved_to_issue).toBeNull();
  });

  it("a trilha LGPD registra a mudança nos dois chamados", async () => {
    expect(await waitAuditoria(antigo.id, "moved_to_issue_id")).not.toBeNull();
    expect(await waitAuditoria(novoId, "moved_from_issue_id")).not.toBeNull();
  });

  it("chamado já movido não se move de novo", async () => {
    const res = await admin.post(rota(origemId, antigo.id), { project_id_destino: destinoId });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).detail).toBe("Este chamado já foi movido para outro sistema.");
  });
});

describe("alterar sistema: recusas", () => {
  it("sem destino, o erro volta no campo", async () => {
    const chamado = await createChamadoSimples(origemId, "Sem destino");
    const res = await admin.post(rota(origemId, chamado.id), {});
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors).toEqual([
      { path: "project_id_destino", message: "Escolha o sistema de destino." },
    ]);
  });

  it("o destino não pode ser o próprio sistema", async () => {
    const chamado = await createChamadoSimples(origemId, "Mesmo sistema");
    const res = await admin.post(rota(origemId, chamado.id), { project_id_destino: origemId });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).errors[0].path).toBe("project_id_destino");
  });

  it("chamado inexistente é 404", async () => {
    const res = await admin.post(rota(origemId, crypto.randomUUID()), { project_id_destino: destinoId });
    expect(res.status).toBe(404);
  });

  it("sistema sem etapa de cancelados recusa com 422 e não abre nada no destino", async () => {
    const chamado = await createChamadoSimples(semCanceladosId, "Sem cancelados");
    const antes = await prisma.issue.count({ where: { projectId: destinoId } });
    const res = await admin.post(rota(semCanceladosId, chamado.id), { project_id_destino: destinoId });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).detail).toBe(
      "O sistema atual não tem etapa de cancelados. Crie uma nas etapas do sistema."
    );
    expect(await prisma.issue.count({ where: { projectId: destinoId } })).toBe(antes);
  });
});

describe("alterar sistema: permissão pela matriz de ações", () => {
  it("Membro não tem a ação por padrão", async () => {
    const chamado = await createChamadoSimples(origemId, "Do membro");
    const res = await membro.api.post(rota(origemId, chamado.id), { project_id_destino: destinoId });
    expect(res.status).toBe(403);
    expect((await prisma.issue.findUniqueOrThrow({ where: { id: chamado.id } })).movedToIssueId).toBeNull();
  });

  it("com a ação concedida por pessoa, o Membro altera", async () => {
    const excecao = await admin.put(`/workspaces/${wsSlug}/roles/members/${membro.id}/`, {
      granted: ["issue.change_system"],
      revoked: [],
    });
    expect(excecao.status).toBe(200);
    const chamado = await createChamadoSimples(origemId, "Membro com concessão");
    const res = await membro.api.post(rota(origemId, chamado.id), { project_id_destino: destinoId });
    expect(res.status).toBe(201);
  });

  it("TI tem a ação, mas precisa participar do sistema de destino", async () => {
    const chamado = await createChamadoSimples(origemId, "Do TI");
    const fora = await ti.api.post(rota(origemId, chamado.id), { project_id_destino: destinoId });
    expect(fora.status).toBe(403);

    await prisma.projectMember.create({
      data: { projectId: destinoId, workspaceId: wsId, memberId: ti.id, role: 12, isActive: true },
    });
    const dentro = await ti.api.post(rota(origemId, chamado.id), { project_id_destino: destinoId });
    expect(dentro.status).toBe(201);
  });
});
