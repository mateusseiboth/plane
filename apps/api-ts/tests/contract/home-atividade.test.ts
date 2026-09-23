/**
 * Atividade da pessoa na página inicial: o que ela abriu, mudou de etapa,
 * concluiu, comentou e as solicitações que ela atendeu, do mais novo para o
 * mais antigo. Reaproveita a trilha do chamado (issue_activities) e os
 * comentários. API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  apiClient,
  createApiToken,
  createIntakeIssue,
  createProject,
  createUser,
  createWorkspace,
  addMember,
  projectStates,
} from "@tests/helpers/factory";
import { cleanDb } from "@tests/helpers/setup";

describe("atividade da pessoa na home", () => {
  let ana: ReturnType<typeof apiClient>;
  let bia: ReturnType<typeof apiClient>;
  let slug: string;
  let projetoId: string;
  let emAndamento: string;
  let concluido: string;

  const issues = (path = "") => `/workspaces/${slug}/projects/${projetoId}/issues/${path}`;

  const openChamado = async (client: ReturnType<typeof apiClient>, name: string) => {
    const res = await client.post(issues(), { name });
    expect(res.status).toBe(201);
    return ((await res.json()) as any).id as string;
  };

  beforeAll(async () => {
    await cleanDb();
    const dona = await createUser({ firstName: "Ana" });
    ana = apiClient((await createApiToken(dona.id)).token);
    const ws = await createWorkspace(dona.id);
    slug = ws.slug;
    const projeto = await createProject(ws.id, dona.id, { name: "Tributos", identifier: "TRIB" });
    projetoId = projeto.id;
    const estados = await projectStates(projeto.id);
    emAndamento = (estados.byName.get("In Progress") as { id: string }).id;
    concluido = (estados.byName.get("Done") as { id: string }).id;

    const outra = await createUser({ firstName: "Bia" });
    bia = apiClient((await createApiToken(outra.id)).token);
    await addMember(ws.id, outra.id, 20, projeto.id, 20);

    // Em série de propósito: a ordem dos eventos é o que o teste confere.
    const primeiro = await openChamado(ana, "Guia do ISS");
    expect((await ana.patch(issues(`${primeiro}/`), { state_id: emAndamento })).status).toBe(200);
    expect((await ana.patch(issues(`${primeiro}/`), { state_id: concluido })).status).toBe(200);
    const comentario = await ana.post(issues(`${primeiro}/comments/`), {
      comment_html: "<p>Guia emitida e enviada ao contribuinte.</p>",
    });
    expect(comentario.status).toBe(201);

    const { issue: daSolicitacao } = await createIntakeIssue(projeto.id, ws.id, { name: "Solicitação do portal" });
    expect((await ana.patch(issues(`${daSolicitacao.id}/`), { state_id: concluido })).status).toBe(200);

    // O que a Bia faz não aparece na atividade da Ana.
    const daBia = await openChamado(bia, "Chamado da Bia");
    await bia.post(issues(`${daBia}/comments/`), { comment_html: "<p>Comentário da Bia.</p>" });
  });

  afterAll(() => cleanDb());

  const readAtividade = async (query = "") => {
    const res = await ana.get(`/workspaces/${slug}/home/atividade/${query}`);
    expect(res.status).toBe(200);
    return (await res.json()) as any[];
  };

  it("traz os eventos da pessoa, do mais novo para o mais antigo, com o tipo de cada um", async () => {
    const eventos = await readAtividade();
    expect(eventos.map((e) => e.tipo)).toEqual([
      "solicitacao_atendida",
      "conclusao",
      "comentario",
      "conclusao",
      "etapa",
      "abertura",
    ]);
    const datas = eventos.map((e) => e.criado_em);
    expect(datas).toEqual(datas.toSorted().toReversed());
  });

  it("cada evento diz o chamado (número e sistema); a etapa vem no evento de etapa", async () => {
    const eventos = await readAtividade();
    const etapa = eventos.find((e) => e.tipo === "etapa");
    expect(etapa.etapa).toBe("In Progress");
    expect(etapa.chamado).toMatchObject({ name: "Guia do ISS", project_id: projetoId, project_identifier: "TRIB" });
    expect(etapa.chamado.numero).toMatch(/^\d+-\d{4}$/);
    expect(eventos.every((e) => typeof e.id === "string" && e.chamado?.id)).toBe(true);
  });

  it("o comentário vem com o texto citado, sem as marcas do HTML", async () => {
    const comentario = (await readAtividade()).find((e) => e.tipo === "comentario");
    expect(comentario.comentario).toBe("Guia emitida e enviada ao contribuinte.");
  });

  it("nada do que outra pessoa fez entra, e o limite corta a lista", async () => {
    const eventos = await readAtividade();
    expect(eventos.some((e) => e.chamado.name === "Chamado da Bia")).toBe(false);
    expect(await readAtividade("?limit=2")).toHaveLength(2);
  });
});
