/**
 * "Links úteis" pela API de verdade: todo membro lê a página, o espaço entra em
 * cada endereço, integrações só para quem administra o chat, god mode só para o
 * administrador da instância, e a inscrição desligada vira aviso.
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import {
  apiClient,
  createApiToken,
  createMemberWithToken,
  createProject,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;
type Cartao = {
  chave: string;
  titulo: string;
  descricao: string;
  quemUsa: string;
  caminho: string;
  aviso: string | null;
};
type Grupo = { chave: string; titulo: string; cartoes: Cartao[] };

const readGrupos = async (client: Client, slug: string) => {
  const res = await client.get(`/workspaces/${slug}/links-uteis/`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { grupos: Grupo[] }).grupos;
};

const readCartao = (grupos: Grupo[], chaveDoGrupo: string, chaveDoCartao: string) =>
  grupos.find((g) => g.chave === chaveDoGrupo)?.cartoes.find((c) => c.chave === chaveDoCartao);

describe("links úteis", () => {
  let slug: string;
  let wsId: string;
  let admin: Client;
  let visualizador: Client;
  let deOutroEspaco: Client;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    await createProject(ws.id, owner.id, { identifier: "SIART", name: "SIART" } as any);
    await seedWorkflowRoles(prisma, ws.id);
    admin = apiClient((await createApiToken(owner.id)).token);
    visualizador = apiClient((await createMemberWithToken(ws.id, 5)).token);

    const estranho = await createUser();
    const outro = await createWorkspace(estranho.id);
    await seedWorkflowRoles(prisma, outro.id);
    deOutroEspaco = apiClient((await createApiToken(estranho.id)).token);
  });

  afterAll(() => cleanDb());

  it("todo membro lê a página, e cada endereço já vem com o espaço", async () => {
    const grupos = await readGrupos(visualizador, slug);
    expect(readCartao(grupos, "cliente", "portal")?.caminho).toBe(`/portal?workspace=${slug}`);
    expect(readCartao(grupos, "paineis", "painel-ti")?.caminho).toBe(`/${slug}/painel/ti`);
  });

  it("o caminho é relativo: quem monta o endereço é a tela", async () => {
    const grupos = await readGrupos(visualizador, slug);
    const caminhos = grupos.flatMap((g) => g.cartoes.map((c) => c.caminho));
    expect(caminhos.filter((c) => c.startsWith("http"))).toEqual([]);
  });

  it("quem não é do espaço não lê os links dele", async () => {
    const res = await deOutroEspaco.get(`/workspaces/${slug}/links-uteis/`);
    expect(res.status).toBe(403);
  });

  it("integrações só para quem administra o chat", async () => {
    expect((await readGrupos(visualizador, slug)).find((g) => g.chave === "integracoes")).toBeUndefined();
    const doAdmin = await readGrupos(admin, slug);
    expect(readCartao(doAdmin, "integracoes", "zapi-webhook")?.caminho).toBe(
      `/chat-api/providers/zapi/webhook/${slug}/`
    );
    expect(readCartao(doAdmin, "integracoes", "freepbx-ligacoes")?.caminho).toBe(
      `/chat-api/workspaces/${slug}/telefonia/ligacoes/`
    );
  });

  it("god mode só para o administrador da instância", async () => {
    expect(readCartao(await readGrupos(admin, slug), "internos", "god-mode")).toBeUndefined();

    const chefe = await createMemberWithToken(wsId, 20);
    await prisma.user.update({ where: { id: chefe.user.id }, data: { isInstanceAdmin: true } });
    const daInstancia = apiClient(chefe.token);
    expect(readCartao(await readGrupos(daInstancia, slug), "internos", "god-mode")?.caminho).toBe("/god-mode/");
  });

  it("inscrição desligada aparece como aviso; ligada, vira link", async () => {
    const fechado = readCartao(await readGrupos(visualizador, slug), "candidato", "trabalhe-conosco");
    expect(fechado?.caminho).toBe("");
    expect(fechado?.aviso).toContain("inscrições estão desligadas");

    expect((await admin.patch(`/workspaces/${slug}/curriculos/config/`, { site_enabled: true })).status).toBe(200);
    const aberto = readCartao(await readGrupos(visualizador, slug), "candidato", "trabalhe-conosco");
    expect(aberto?.caminho).toBe(`/trabalhe-conosco?workspace=${slug}`);
    expect(aberto?.aviso).toBeNull();
  });
});
