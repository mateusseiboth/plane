/**
 * Testes de contrato das etiquetas de um chamado (PATCH .../issues/:id/ com label_ids).
 *
 * Defeito de origem: a rota apagava logicamente TODAS as linhas de issue_labels
 * do chamado com o mesmo carimbo de hora e recriava as escolhidas. Como a chave
 * única é (issue_id, label_id, deleted_at), a segunda troca colapsava duas
 * linhas da mesma etiqueta no mesmo carimbo e o Postgres devolvia
 * {"detail":"Registro já existe."} — travando o chamado para adicionar E remover.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { createUser, createApiToken, createWorkspace, createProject, apiClient } from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";

describe("Etiquetas do chamado", () => {
  let client: ReturnType<typeof apiClient>;
  let wsSlug: string;
  let projectId: string;
  let userId: string;
  let etiquetas: Record<string, string> = {};

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    userId = user.id;
    const token = await createApiToken(userId);
    const ws = await createWorkspace(userId);
    wsSlug = ws.slug;
    const project = await createProject(ws.id, userId);
    projectId = project.id;
    client = apiClient(token.token);

    // As mesmas três etiquetas do espaço relatado.
    for (const nome of ["Correção", "Melhoria", "Projeto"]) {
      const res = await client.post(`/workspaces/${wsSlug}/projects/${projectId}/labels/`, {name: nome});
      etiquetas[nome] = ((await res.json()) as any).id;
    }
  });

  afterAll(() => cleanDb());

  const issuesUrl = () => `/workspaces/${wsSlug}/projects/${projectId}/issues/`;

  async function criarChamado(name: string, labelIds: string[] = []) {
    const res = await client.post(issuesUrl(), {name, label_ids: labelIds});
    expect(res.status).toBe(201);
    return (await res.json()) as any;
  }

  async function aplicar(issueId: string, labelIds: string[]) {
    const res = await client.patch(`${issuesUrl()}${issueId}/`, {label_ids: labelIds});
    const corpo = (await res.json()) as any;
    return {status: res.status, corpo};
  }

  /** Linhas em issue_labels, inclusive as apagadas logicamente. */
  async function linhas(issueId: string) {
    return prismaReal().issueLabel.findMany({where: {issueId}, select: {labelId: true, deletedAt: true}});
  }

  const ordenado = (ids: string[]) => [...ids].sort();

  it("adiciona a terceira etiqueta uma a uma sem 'Registro já existe.'", async () => {
    const chamado = await criarChamado("Terceira etiqueta");
    const [correcao, melhoria, projeto] = [etiquetas["Correção"], etiquetas["Melhoria"], etiquetas["Projeto"]];

    const primeira = await aplicar(chamado.id, [correcao]);
    expect(primeira.status).toBe(200);
    expect(primeira.corpo.label_ids).toEqual([correcao]);

    const segunda = await aplicar(chamado.id, [correcao, melhoria]);
    expect(segunda.status).toBe(200);
    expect(ordenado(segunda.corpo.label_ids)).toEqual(ordenado([correcao, melhoria]));

    const terceira = await aplicar(chamado.id, [correcao, melhoria, projeto]);
    expect(terceira.status).toBe(200);
    expect(ordenado(terceira.corpo.label_ids)).toEqual(ordenado([correcao, melhoria, projeto]));
  });

  it("caso do relato: chamado com duas etiquetas recebe a terceira e depois consegue remover", async () => {
    // Estado da captura de tela: "Projeto" e "Correção" já aplicadas.
    const chamado = await criarChamado("Relato do dono do produto", [etiquetas["Projeto"], etiquetas["Correção"]]);
    // Uma troca qualquer antes, que é o que deixava o resíduo na tabela.
    expect((await aplicar(chamado.id, [etiquetas["Projeto"]])).status).toBe(200);
    expect((await aplicar(chamado.id, [etiquetas["Projeto"], etiquetas["Correção"]])).status).toBe(200);

    const terceira = await aplicar(chamado.id, [etiquetas["Projeto"], etiquetas["Correção"], etiquetas["Melhoria"]]);
    expect(terceira.status).toBe(200);
    expect(ordenado(terceira.corpo.label_ids)).toEqual(
      ordenado([etiquetas["Projeto"], etiquetas["Correção"], etiquetas["Melhoria"]]),
    );

    // E remover continua funcionando depois disso.
    const removida = await aplicar(chamado.id, [etiquetas["Projeto"], etiquetas["Correção"]]);
    expect(removida.status).toBe(200);
    expect(ordenado(removida.corpo.label_ids)).toEqual(ordenado([etiquetas["Projeto"], etiquetas["Correção"]]));
  });

  it("remove e re-adiciona a mesma etiqueta quantas vezes for preciso", async () => {
    const chamado = await criarChamado("Vai e volta", [etiquetas["Correção"]]);

    for (let volta = 0; volta < 3; volta++) {
      const semEtiqueta = await aplicar(chamado.id, []);
      expect(semEtiqueta.status).toBe(200);
      expect(semEtiqueta.corpo.label_ids).toEqual([]);

      const comEtiqueta = await aplicar(chamado.id, [etiquetas["Correção"]]);
      expect(comEtiqueta.status).toBe(200);
      expect(comEtiqueta.corpo.label_ids).toEqual([etiquetas["Correção"]]);
    }

    // A linha é restaurada, não duplicada: uma única linha por etiqueta.
    expect(await linhas(chamado.id)).toHaveLength(1);
  });

  it("aplicar o mesmo conjunto duas vezes dá o mesmo resultado", async () => {
    const conjunto = [etiquetas["Correção"], etiquetas["Melhoria"]];
    const chamado = await criarChamado("Idempotente");

    const primeira = await aplicar(chamado.id, conjunto);
    const segunda = await aplicar(chamado.id, conjunto);
    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(ordenado(segunda.corpo.label_ids)).toEqual(ordenado(conjunto));
    expect(await linhas(chamado.id)).toHaveLength(2);

    // Repetido no corpo da requisição também não duplica.
    const repetida = await aplicar(chamado.id, [...conjunto, etiquetas["Correção"]]);
    expect(repetida.status).toBe(200);
    expect(ordenado(repetida.corpo.label_ids)).toEqual(ordenado(conjunto));
    expect(await linhas(chamado.id)).toHaveLength(2);
  });

  it("remove todas as etiquetas", async () => {
    const todas = [etiquetas["Correção"], etiquetas["Melhoria"], etiquetas["Projeto"]];
    const chamado = await criarChamado("Zerar", todas);

    const zerado = await aplicar(chamado.id, []);
    expect(zerado.status).toBe(200);
    expect(zerado.corpo.label_ids).toEqual([]);

    // Zerar de novo é inofensivo.
    const denovo = await aplicar(chamado.id, []);
    expect(denovo.status).toBe(200);
    expect(denovo.corpo.label_ids).toEqual([]);

    const vivas = (await linhas(chamado.id)).filter((l) => l.deletedAt === null);
    expect(vivas).toHaveLength(0);
  });

  it("chamado já travado com linha viva e linha apagada volta a aceitar etiquetas", async () => {
    // Reproduz na marra o resíduo que existe hoje em produção: mesma etiqueta
    // com uma linha viva e uma apagada logicamente.
    const chamado = await criarChamado("Travado", [etiquetas["Melhoria"], etiquetas["Projeto"]]);
    const ws = await prismaReal().workspace.findFirstOrThrow({where: {slug: wsSlug}, select: {id: true}});
    await prismaReal().issueLabel.create({
      data: {
        issueId: chamado.id,
        labelId: etiquetas["Melhoria"],
        workspaceId: ws.id,
        projectId,
        deletedAt: new Date("2026-08-12T20:33:11.096Z"),
      },
    });

    const terceira = await aplicar(chamado.id, [etiquetas["Melhoria"], etiquetas["Projeto"], etiquetas["Correção"]]);
    expect(terceira.status).toBe(200);
    expect(ordenado(terceira.corpo.label_ids)).toEqual(
      ordenado([etiquetas["Melhoria"], etiquetas["Projeto"], etiquetas["Correção"]]),
    );

    const removida = await aplicar(chamado.id, [etiquetas["Projeto"]]);
    expect(removida.status).toBe(200);
    expect(removida.corpo.label_ids).toEqual([etiquetas["Projeto"]]);
  });

  it("responsáveis seguem a mesma regra e não travam na terceira troca", async () => {
    const outro = await createUser();
    const maisUm = await createUser();
    const ws = await prismaReal().workspace.findFirstOrThrow({where: {slug: wsSlug}, select: {id: true}});
    for (const membro of [outro, maisUm]) {
      await prismaReal().workspaceMember.create({data: {workspaceId: ws.id, memberId: membro.id, role: 15, isActive: true}});
      await prismaReal().projectMember.create({data: {projectId, workspaceId: ws.id, memberId: membro.id, role: 15, isActive: true}});
    }
    const chamado = await criarChamado("Responsáveis");

    const trocas = [[userId], [userId, outro.id], [outro.id], [outro.id, maisUm.id], [userId, outro.id, maisUm.id]];
    for (const conjunto of trocas) {
      const res = await client.patch(`${issuesUrl()}${chamado.id}/`, {assignee_ids: conjunto});
      expect(res.status).toBe(200);
      const corpo = (await res.json()) as any;
      expect(ordenado(corpo.assignee_ids)).toEqual(ordenado(conjunto));
    }
  });
});
