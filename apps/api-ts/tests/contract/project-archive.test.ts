/**
 * Arquivar e restaurar um projeto (sistema).
 *
 * O menu "Arquivar projeto" já existia na interface, mas o backend não tinha a
 * rota: o botão devolvia NOT_FOUND e o projeto continuava ativo. Estes testes
 * fixam o contrato das duas rotas e o efeito colateral que o Django também tem
 * — arquivar tira o projeto dos favoritos e some com ele dos seletores.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  addMember,
  apiClient,
  createApiToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

describe("TestProjectArchive", () => {
  let admin: ReturnType<typeof apiClient>;
  let leitor: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let wsId: string;
  let ownerId: string;

  const novoProjeto = async (identifier: string) => (await createProject(wsId, ownerId, { identifier })).id;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser({ email: "arquivo-projeto-owner@plane.test" });
    ownerId = owner.id;
    admin = apiClient((await createApiToken(owner.id)).token);
    const ws = await createWorkspace(owner.id);
    wsSlug = ws.slug;
    wsId = ws.id;
  });

  afterAll(() => cleanDb());

  const arquivo = (projectId: string) => `/workspaces/${wsSlug}/projects/${projectId}/archive/`;
  const lista = () => `/workspaces/${wsSlug}/projects/`;
  const detalhes = () => `/workspaces/${wsSlug}/projects/details/`;

  const buscarNosDetalhes = async (projectId: string) => {
    const projetos = (await (await admin.get(detalhes())).json()) as any[];
    return projetos.find((p) => p.id === projectId);
  };

  it("arquivar devolve a data e carimba o projeto", async () => {
    const projectId = await novoProjeto("ARQ1");

    const res = await admin.post(arquivo(projectId), {});
    expect(res.status).toBe(200);
    const { archived_at } = (await res.json()) as any;
    expect(typeof archived_at).toBe("string");

    expect((await buscarNosDetalhes(projectId)).archived_at).toBe(archived_at);
  });

  it("o projeto arquivado sai dos seletores e continua nos detalhes", async () => {
    const projectId = await novoProjeto("ARQ2");
    await admin.post(arquivo(projectId), {});

    const seletores = (await (await admin.get(lista())).json()) as any[];
    expect(seletores.some((p) => p.id === projectId)).toBe(false);

    // A tela de arquivados se alimenta de /details/, então ele PRECISA aparecer lá.
    expect(await buscarNosDetalhes(projectId)).toBeDefined();
  });

  it("arquivar tira o projeto dos favoritos", async () => {
    const projectId = await novoProjeto("ARQ3");
    const criado = await admin.post(`/workspaces/${wsSlug}/user-favorites/`, {
      entity_type: "project",
      entity_identifier: projectId,
      name: "Favorito que some",
    });
    expect(criado.status).toBe(201);

    await admin.post(arquivo(projectId), {});

    const favoritos = (await (await admin.get(`/workspaces/${wsSlug}/user-favorites/`)).json()) as any[];
    expect(favoritos.some((f) => f.entity_identifier === projectId)).toBe(false);
  });

  it("restaurar devolve 204 e limpa a data", async () => {
    const projectId = await novoProjeto("ARQ4");
    await admin.post(arquivo(projectId), {});

    const res = await admin.delete(arquivo(projectId));
    expect(res.status).toBe(204);

    expect((await buscarNosDetalhes(projectId)).archived_at).toBeNull();
    const seletores = (await (await admin.get(lista())).json()) as any[];
    expect(seletores.some((p) => p.id === projectId)).toBe(true);
  });

  it("o projeto arquivado continua acessível pelo id (para poder ser restaurado)", async () => {
    const projectId = await novoProjeto("ARQ5");
    await admin.post(arquivo(projectId), {});

    const res = await admin.get(`/workspaces/${wsSlug}/projects/${projectId}/`);
    expect(res.status).toBe(200);
    expect(typeof ((await res.json()) as any).archived_at).toBe("string");
  });

  it("visualizador não arquiva nem restaura", async () => {
    const projectId = await novoProjeto("ARQ6");
    const visualizador = await createUser({ email: "arquivo-projeto-leitor@plane.test" });
    await addMember(wsId, visualizador.id, 5, projectId, 5);
    leitor = apiClient((await createApiToken(visualizador.id)).token);

    expect((await leitor.post(arquivo(projectId), {})).status).toBe(403);
    await admin.post(arquivo(projectId), {});
    expect((await leitor.delete(arquivo(projectId))).status).toBe(403);
  });

  it("projeto inexistente devolve 404, não 500", async () => {
    const res = await admin.post(arquivo("00000000-0000-0000-0000-000000000000"), {});
    expect(res.status).toBe(404);
  });

  it("projeto de outro espaço de trabalho não pode ser arquivado", async () => {
    const outroOwner = await createUser({ email: "arquivo-projeto-outro@plane.test" });
    const outraWs = await createWorkspace(outroOwner.id);
    const alheio = (await createProject(outraWs.id, outroOwner.id, { identifier: "ALHE" })).id;

    expect((await admin.post(arquivo(alheio), {})).status).toBe(404);
    expect(await prisma.project.findFirst({ where: { id: alheio, archivedAt: null } })).not.toBeNull();
  });
});
