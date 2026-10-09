/**
 * Fixar e desfixar itens da barra lateral pela API de verdade: toda chave do
 * catálogo (as do espaço e as pessoais) aceita os dois estados, a escolha volta
 * na leitura e fica separada por pessoa e por espaço.
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createMemberWithToken, createUser, createWorkspace } from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;
type Preferencia = { key: string; is_pinned: boolean; sort_order: number };

// Catálogo da barra lateral (packages/constants: WORKSPACE_SIDEBAR_*_NAVIGATION_ITEMS).
// As chaves do espaço que já obedeciam eram só chat, views, analytics e archives.
const CHAVES_DO_CATALOGO = [
  "your_work",
  "stickies",
  "drafts",
  "projects",
  "all-work-items",
  "global-intake",
  "visits",
  "chat",
  "contatos",
  "mural",
  "wiki",
  "ouvidoria",
  "denuncias",
  "curriculos",
  "pos-atendimento",
  "links-uteis",
  "views",
  "analytics",
  "reports",
  "archives",
];

const readPreferencias = async (client: Client, slug: string) => {
  const res = await client.get(`/workspaces/${slug}/sidebar-preferences/`);
  expect(res.status).toBe(200);
  return (await res.json()) as Record<string, Preferencia>;
};

const sendLote = async (client: Client, slug: string, itens: Array<Partial<Preferencia> & { key: string }>) => {
  const res = await client.patch(`/workspaces/${slug}/sidebar-preferences/`, itens);
  expect(res.status).toBe(200);
};

describe("fixação dos itens da barra lateral", () => {
  let slug: string;
  let outroSlug: string;
  let dono: Client;
  let colega: Client;

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    dono = apiClient((await createApiToken(owner.id)).token);
    colega = apiClient((await createMemberWithToken(ws.id, 15)).token);
    outroSlug = (await createWorkspace(owner.id)).slug;
  });

  it.each(CHAVES_DO_CATALOGO)("desfixa e fixa de novo %s, item por item", async (chave) => {
    const desfixar = await dono.patch(`/workspaces/${slug}/sidebar-preferences/${chave}/`, { is_pinned: false });
    expect(desfixar.status).toBe(200);
    expect((await readPreferencias(dono, slug))[chave]?.is_pinned).toBe(false);

    const fixar = await dono.patch(`/workspaces/${slug}/sidebar-preferences/${chave}/`, { is_pinned: true });
    expect(fixar.status).toBe(200);
    expect((await readPreferencias(dono, slug))[chave]?.is_pinned).toBe(true);
  });

  it("desfixa o catálogo inteiro num lote só e cada chave volta desfixada, com a ordem", async () => {
    await sendLote(
      dono,
      slug,
      CHAVES_DO_CATALOGO.map((key, indice) => ({ key, is_pinned: false, sort_order: indice * 10 }))
    );

    const lidas = await readPreferencias(dono, slug);
    for (const [indice, chave] of CHAVES_DO_CATALOGO.entries()) {
      expect(lidas[chave]).toEqual({ key: chave, is_pinned: false, sort_order: indice * 10 });
    }
  });

  it("mudar só a ordem não desfaz a fixação gravada", async () => {
    await sendLote(dono, slug, [{ key: "mural", is_pinned: true, sort_order: 1 }]);
    await sendLote(dono, slug, [{ key: "mural", sort_order: 5 }]);

    expect((await readPreferencias(dono, slug)).mural).toEqual({ key: "mural", is_pinned: true, sort_order: 5 });
  });

  it("a escolha de uma pessoa não aparece para a outra nem em outro espaço", async () => {
    await sendLote(dono, slug, [{ key: "wiki", is_pinned: false, sort_order: 0 }]);

    expect((await readPreferencias(colega, slug)).wiki).toBeUndefined();
    expect((await readPreferencias(dono, outroSlug)).wiki).toBeUndefined();
  });
});
