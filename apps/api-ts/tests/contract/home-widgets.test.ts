/**
 * Preferências da grade de widgets da página inicial: cada pessoa guarda, por
 * espaço, a ordem, o tamanho e o ligado/desligado de cada widget. Lê, salva,
 * migra quem ainda tem o formato antigo e recusa quem não está logado.
 * API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  addMember,
  apiClient,
  createApiToken,
  createUser,
  createWorkspace,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";

const LAYOUT = [
  { chave: "mural", ordem: 0, tamanho: "1/1", ligado: true },
  { chave: "widget:0198c1d2-aaaa-7bbb-8ccc-123456789abc", ordem: 1, tamanho: "1/2", ligado: true },
  { chave: "perfil", ordem: 2, tamanho: "1/3", ligado: false },
];

describe("preferências dos widgets da home", () => {
  let ana: ReturnType<typeof apiClient>;
  let bia: ReturnType<typeof apiClient>;
  let anaId: string;
  let biaId: string;
  let slug: string;
  let outroSlug: string;
  let workspaceId: string;

  const rota = (outro?: string) => `/workspaces/${outro ?? slug}/home-preferences/`;

  beforeAll(async () => {
    await cleanDb();
    const dona = await createUser({ firstName: "Ana" });
    anaId = dona.id;
    ana = apiClient((await createApiToken(dona.id)).token);
    const ws = await createWorkspace(dona.id);
    slug = ws.slug;
    workspaceId = ws.id;
    outroSlug = (await createWorkspace(dona.id)).slug;

    const outra = await createUser({ firstName: "Bia" });
    biaId = outra.id;
    bia = apiClient((await createApiToken(outra.id)).token);
    await addMember(ws.id, outra.id, 15);
  });

  afterAll(() => cleanDb());

  const readWidgets = async (client = ana, s = slug) => {
    const res = await client.get(rota(s));
    expect(res.status).toBe(200);
    return ((await res.json()) as { widgets: unknown[] }).widgets;
  };

  it("sem nada salvo devolve lista vazia", async () => {
    expect(await readWidgets()).toEqual([]);
  });

  it("salva a grade e lê de volta igual", async () => {
    const res = await ana.put(rota(), { widgets: LAYOUT });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { widgets: unknown[] }).widgets).toEqual(LAYOUT);
    expect(await readWidgets()).toEqual(LAYOUT);
  });

  it("a grade é por pessoa e por espaço", async () => {
    expect(await readWidgets(bia)).toEqual([]);
    expect(await readWidgets(ana, outroSlug)).toEqual([]);
  });

  it("não apaga as outras preferências guardadas no mesmo lugar", async () => {
    const props = await prismaReal().workspaceUserProperties.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: anaId } },
    });
    await prismaReal().workspaceUserProperties.update({
      where: { id: props!.id },
      data: { displayFilters: { ...(props!.displayFilters as object), quick_links: [{ id: "link-1" }] } },
    });
    await ana.put(rota(), { widgets: LAYOUT.slice(0, 1) });
    const depois = await prismaReal().workspaceUserProperties.findUnique({ where: { id: props!.id } });
    expect((depois!.displayFilters as Record<string, unknown>).quick_links).toEqual([{ id: "link-1" }]);
  });

  it("tamanho inválido é recusado no campo do item", async () => {
    const res = await ana.put(rota(), { widgets: [{ chave: "mural", ordem: 0, tamanho: "3/4", ligado: true }] });
    expect(res.status).toBe(400);
    const corpo = (await res.json()) as { errors: { path: string; message: string }[] };
    expect(corpo.errors).toEqual([
      { path: "widgets[0].tamanho", message: "Escolha um tamanho: 1/3, 1/2, 2/3 ou inteiro." },
    ]);
  });

  it("migra quem ainda tem o formato antigo e, ao salvar, o antigo sai", async () => {
    await prismaReal().workspaceUserProperties.create({
      data: {
        workspaceId,
        userId: biaId,
        displayFilters: {
          widget_preferences: {
            recents: { is_enabled: false, sort_order: 3 },
            my_work_items: { is_enabled: true, sort_order: 7 },
          },
        },
      },
    });
    expect(await readWidgets(bia)).toEqual([
      { chave: "my_work_items", ordem: 0, tamanho: null, ligado: true },
      { chave: "recents", ordem: 1, tamanho: null, ligado: false },
    ]);

    expect((await bia.put(rota(), { widgets: LAYOUT })).status).toBe(200);
    const gravado = await prismaReal().workspaceUserProperties.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: biaId } },
    });
    const filtros = gravado!.displayFilters as Record<string, unknown>;
    expect(filtros.widget_preferences).toBeUndefined();
    expect(filtros.home_widgets).toEqual(LAYOUT);
  });

  it("sem chave e sem sessão é 401", async () => {
    const url = `${TEST_API_BASE_URL}/api/v1${rota()}`;
    expect((await fetch(url)).status).toBe(401);
    const put = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ widgets: LAYOUT }),
    });
    expect(put.status).toBe(401);
  });

  it("quem não é do espaço não lê nem salva", async () => {
    const estranha = await createUser({ firstName: "Cida" });
    const cida = apiClient((await createApiToken(estranha.id)).token);
    expect((await cida.get(rota())).status).toBe(403);
    expect((await cida.put(rota(), { widgets: LAYOUT })).status).toBe(403);
  });
});
