/**
 * Recusar solicitação exige o motivo, e quem abriu fica sabendo (testes da nova
 * intranet, 16/11/2026, itens 5 e 7): a Qualidade recusava sem escrever nada e
 * o atendimento não era avisado.
 *
 * O motivo vira comentário no chamado (quem abriu lê na própria solicitação) e
 * a notificação vai para o sino de quem abriu. Decidir a triagem (aceitar,
 * recusar, adiar, duplicada) é de quem tem `intake.review`, conferido no
 * servidor: com todo membro em todo sistema, o Atendimento também é membro.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  buildPedidoDeSolicitacao,
  createApiToken,
  createProject,
  createState,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

let base: string;
let qualidade: ReturnType<typeof apiClient>;
let atendimento: ReturnType<typeof apiClient>;
let atendenteId: string;
let wsId: string;
let wsSlug: string;

const createPessoa = async (wsId: string, projectId: string, key: string) => {
  const user = await createUser();
  const funcao = await prisma.workflowRole.findFirstOrThrow({ where: { workspaceId: wsId, key, deletedAt: null } });
  await prisma.workspaceMember.create({
    data: { workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id, isActive: true },
  });
  await prisma.projectMember.create({
    data: { projectId, workspaceId: wsId, memberId: user.id, role: funcao.level, workflowRoleId: funcao.id },
  });
  return { user, api: apiClient((await createApiToken(user.id)).token) };
};

const openSolicitacao = async (name: string) =>
  (
    (await (
      await atendimento.post(`${base}/inbox-issues/`, await buildPedidoDeSolicitacao(wsId, { name }))
    ).json()) as { id: string }
  ).id;

const readEtapa = async (id: string) =>
  (await prisma.issue.findUniqueOrThrow({ where: { id }, include: { state: true } })).state?.name ?? null;

beforeAll(async () => {
  await cleanDb();
  const dono = await createUser();
  const ws = await createWorkspace(dono.id);
  wsId = ws.id;
  wsSlug = ws.slug;
  await seedWorkflowRoles(prisma, ws.id);
  const sistema = await createProject(ws.id, dono.id);
  await createState(sistema.id, ws.id, { name: "Cancelado", group: "cancelled" });
  base = `/workspaces/${ws.slug}/projects/${sistema.id}`;
  qualidade = (await createPessoa(ws.id, sistema.id, "qualidade")).api;
  const atendente = await createPessoa(ws.id, sistema.id, "atendimento");
  atendimento = atendente.api;
  atendenteId = atendente.user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("recusa da solicitação", () => {
  it("sem motivo, não recusa: o erro volta para o campo motivo", async () => {
    const id = await openSolicitacao("Sem motivo");
    const corpos = [{ status: -1 }, { status: -1, motivo: "   " }, { status: -1, motivo: "não" }];
    const respostas = await Promise.all(corpos.map((corpo) => qualidade.patch(`${base}/inbox-issues/${id}/`, corpo)));
    for (const res of respostas) expect(res.status).toBe(400);
    const erros = (await Promise.all(respostas.map((res) => res.json()))) as { errors: { path: string }[] }[];
    for (const erro of erros) expect(erro.errors.map((e) => e.path)).toEqual(["motivo"]);
    expect(await readEtapa(id)).toBe("Triagem");
  });

  it("com motivo, recusa, grava o motivo como comentário e avisa quem abriu", async () => {
    const id = await openSolicitacao("Relatório de férias");
    const motivo = "Já existe no menu Relatórios > Férias. Oriente o cliente a usar a versão 4.2.";
    const res = await qualidade.patch(`${base}/inbox-issues/${id}/`, { status: -1, motivo });
    expect(res.status).toBe(200);
    expect(await readEtapa(id)).toBe("Cancelado");

    const comentarios = await prisma.issueComment.findMany({ where: { issueId: id, deletedAt: null } });
    expect(comentarios).toHaveLength(1);
    expect(comentarios[0].commentStripped).toContain(motivo);
    expect(comentarios[0].commentHtml).toContain("Solicitação recusada");

    const avisos = await prisma.notification.findMany({ where: { issueId: id, receiverId: atendenteId } });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].title).toBe("Solicitação recusada");
    expect(avisos[0].message).toContain(motivo.slice(0, 40));
  });

  it("solicitação de cliente parado chega no sino da Qualidade marcada como urgente", async () => {
    const id = (
      (await (
        await atendimento.post(
          `${base}/inbox-issues/`,
          await buildPedidoDeSolicitacao(wsId, { name: "Folha não fecha", priority: "urgent" })
        )
      ).json()) as { id: string }
    ).id;
    const res = await qualidade.get(`/workspaces/${wsSlug}/users/notifications/?type=all&read=false`);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { results: any[] };
    const aviso = corpo.results.find((n) => n.entity_identifier === id);
    expect(aviso?.title).toBe("Cliente parado: nova solicitação");
    expect(aviso?.message_html).toBe("Folha não fecha");
    expect(aviso?.data?.urgente).toBe(true);
  });

  it("o motivo é escapado: não vira marcação no comentário", async () => {
    const id = await openSolicitacao("Com marcação");
    const motivo = "<img src=x onerror=alert(1)> pedido duplicado";
    expect((await qualidade.patch(`${base}/inbox-issues/${id}/`, { status: -1, motivo })).status).toBe(200);
    const [comentario] = await prisma.issueComment.findMany({ where: { issueId: id } });
    expect(comentario.commentHtml).not.toContain("<img");
    expect(comentario.commentHtml).toContain("&lt;img");
  });

  it("quem não tria não decide a solicitação", async () => {
    const id = await openSolicitacao("Atendimento tentando aceitar");
    const corpos = [{ status: 1 }, { status: -1, motivo: "Recusando por conta própria." }, { status: 0 }];
    const respostas = await Promise.all(corpos.map((corpo) => atendimento.patch(`${base}/inbox-issues/${id}/`, corpo)));
    expect(respostas.map((res) => res.status)).toEqual([403, 403, 403]);
    expect(await readEtapa(id)).toBe("Triagem");
  });

  it("aceitar não pede motivo", async () => {
    const id = await openSolicitacao("Aceita sem motivo");
    expect((await qualidade.patch(`${base}/inbox-issues/${id}/`, { status: 1 })).status).toBe(200);
  });
});
