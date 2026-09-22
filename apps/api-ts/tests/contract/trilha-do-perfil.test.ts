/**
 * Trilha do perfil ("Seu trabalho" → Atividade recente e aba Atividade):
 * GET /workspaces/:slug/user-activity/:user_id/.
 *
 * O endpoint devolvia o objeto cru do Prisma (camelCase). A tela lê
 * `IIssueActivity` em snake_case, então o autor sumia (avatar "?" e nome
 * vazio) e a frase saía truncada ("definiu o estado como" sem nada depois).
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
  projectStates,
} from "@tests/helpers/factory";

describe("trilha de atividades do perfil", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let projectIdentifier: string;
  let userId: string;
  let issueId: string;
  let atividades: any[];

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser({ displayName: "Ana Trilha" });
    userId = user.id;
    const token = await createApiToken(user.id);
    const ws = await createWorkspace(user.id);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, user.id);
    projectId = project.id;
    projectIdentifier = project.identifier;
    client = apiClient(token.token);

    const etapas = await projectStates(projectId);
    const emAndamento = etapas.byName.get("In Progress") as { id: string };

    const criado = (await (
      await client.post(`/workspaces/${wsSlug}/projects/${projectId}/issues/`, {
        name: "Chamado da trilha",
      })
    ).json()) as any;
    issueId = criado.id;

    await client.patch(`/workspaces/${wsSlug}/projects/${projectId}/issues/${issueId}/`, {
      state_id: emAndamento.id,
      target_date: "2026-09-30T14:00:00.000Z",
    });

    // Marcador interno da resposta ao cliente: existe para o sistema, não para
    // o usuário ler. Na tela saía como uma linha só com o avatar.
    await prismaReal().issueActivity.create({
      data: {
        issueId,
        workspaceId: ws.id,
        projectId,
        actorId: userId,
        verb: "updated",
        field: "portal_resposta",
        newValue: "dispensada",
        epoch: Date.now(),
      },
    });

    const resposta = await client.get(`/workspaces/${wsSlug}/user-activity/${userId}/?per_page=50`);
    expect(resposta.status).toBe(200);
    atividades = ((await resposta.json()) as any).results;
  });

  afterAll(() => cleanDb());

  const doCampo = (campo: string) => atividades.find((a) => a.field === campo);

  it("todo item traz o autor em actor_detail", () => {
    expect(atividades.length).toBeGreaterThan(0);
    for (const a of atividades) {
      expect(a.actor).toBe(userId);
      expect(a.actor_detail).toMatchObject({ id: userId, display_name: "Ana Trilha" });
      expect(a.actor_detail).toHaveProperty("avatar_url");
    }
  });

  it("a mudança de etapa traz o NOME da etapa em new_value", () => {
    expect(doCampo("state")).toMatchObject({ old_value: "Backlog", new_value: "In Progress" });
  });

  it("o prazo traz o valor em new_value, não só a remoção", () => {
    expect(doCampo("target_date")?.new_value).toBe("2026-09-30T14:00:00.000Z");
  });

  it("traz o chamado e o projeto para o link da frase", () => {
    const criacao = doCampo("issue");
    expect(criacao).toMatchObject({ verb: "created", issue: issueId, project: projectId });
    expect(criacao.issue_detail).toMatchObject({ id: issueId, name: "Chamado da trilha" });
    expect(criacao.issue_detail.sequence_id).toBeGreaterThan(0);
    expect(criacao.project_detail).toMatchObject({ id: projectId, identifier: projectIdentifier });
    expect(criacao.workspace_detail).toMatchObject({ slug: wsSlug });
  });

  it("datas e identificadores saem na forma que a tela espera", () => {
    const a = atividades[0];
    expect(typeof a.created_at).toBe("string");
    expect(a).toHaveProperty("old_identifier");
    expect(a).toHaveProperty("new_identifier");
    expect(a).not.toHaveProperty("oldValue");
    expect(a).not.toHaveProperty("createdAt");
  });

  it("marcador interno não é listado", () => {
    expect(doCampo("portal_resposta")).toBeUndefined();
  });
});
