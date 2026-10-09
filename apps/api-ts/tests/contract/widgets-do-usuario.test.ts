/**
 * Widgets "meus": qualquer membro ativo envia um widget que só aparece na home
 * dele. Quem administra a instância (ou é do TI) vê esses widgets na aba
 * "De usuários" e pode torná-los globais.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { strToU8, zipSync } from "fflate";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import {
  addMember,
  apiClient,
  createApiToken,
  createUser,
  createWorkspace,
  TEST_API_BASE_URL,
} from "@tests/helpers/factory";

const API = `${TEST_API_BASE_URL}/api/v1`;

function buildWidgetZip(name: string, version = "1.0.0", extra: Record<string, unknown> = {}): Blob {
  const manifest = JSON.stringify({
    name,
    version,
    author: "Pessoa",
    entry: "widget.js",
    permissions: ["worker-items.read"],
    ...extra,
  });
  const zipped = zipSync({
    "manifest.json": strToU8(manifest),
    "widget.js": strToU8("export default function Widget() { return null; }"),
  });
  return new Blob([zipped], { type: "application/zip" });
}

function uploadTo(path: string, token: string, zip: Blob) {
  const form = new FormData();
  form.append("file", zip, "widget.zip");
  return fetch(`${API}${path}`, { method: "POST", headers: { "X-Api-Key": token }, body: form });
}

const idsDe = (res: { results: Array<{ id: string }> }) => res.results.map((w) => w.id);

describe("widgets do usuário", () => {
  let autora: { id: string; token: string };
  let outra: { id: string; token: string };
  let admin: { id: string; token: string };
  let semEspaco: { id: string; token: string };
  let meuId: string;

  const createPessoa = async (workspaceId?: string) => {
    const user = await createUser();
    if (workspaceId) await addMember(workspaceId, user.id, 15);
    const token = await createApiToken(user.id);
    return { id: user.id, token: token.token };
  };

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    autora = await createPessoa(ws.id);
    outra = await createPessoa(ws.id);
    admin = await createPessoa(ws.id);
    await prisma.user.update({ where: { id: admin.id }, data: { isInstanceAdmin: true } });
    semEspaco = await createPessoa();
  });

  afterAll(() => cleanDb());

  it("membro comum envia o próprio widget sem ser admin", async () => {
    const res = await uploadTo("/widgets/mine/", autora.token, buildWidgetZip("Meu painel"));
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.scope).toBe("user");
    expect(body.owner_user_id).toBe(autora.id);
    expect(body.status).toBe("ACTIVE");
    meuId = body.id;
  });

  it("quem não participa de nenhum espaço ativo não envia", async () => {
    const res = await uploadTo("/widgets/mine/", semEspaco.token, buildWidgetZip("Sem espaço"));
    expect(res.status).toBe(403);
  });

  it("o manifesto passa pela mesma validação do envio global", async () => {
    const res = await uploadTo("/widgets/mine/", autora.token, buildWidgetZip("Ruim", "1.0"));
    expect(res.status).toBe(400);
  });

  it("a mesma versão do mesmo widget não entra duas vezes para a mesma pessoa", async () => {
    const res = await uploadTo("/widgets/mine/", autora.token, buildWidgetZip("Meu painel"));
    expect(res.status).toBe(409);
  });

  it("outra pessoa pode ter um widget com o mesmo nome e versão", async () => {
    const res = await uploadTo("/widgets/mine/", outra.token, buildWidgetZip("Meu painel"));
    expect(res.status).toBe(201);
  });

  it("GET /widgets/mine/ lista só os da pessoa", async () => {
    const res = await apiClient(autora.token).get("/widgets/mine/");
    expect(res.status).toBe(200);
    expect(idsDe((await res.json()) as any)).toEqual([meuId]);
  });

  it("a listagem da home devolve o meu para a autora", async () => {
    const res = await apiClient(autora.token).get("/widgets/?status=ACTIVE");
    expect(idsDe((await res.json()) as any)).toContain(meuId);
  });

  it("o widget privado não aparece para outra pessoa", async () => {
    const lista = await apiClient(outra.token).get("/widgets/?status=ACTIVE");
    expect(idsDe((await lista.json()) as any)).not.toContain(meuId);
    expect((await apiClient(outra.token).get(`/widgets/${meuId}`)).status).toBe(404);
    expect((await apiClient(outra.token).get(`/widgets/${meuId}/assets/widget.js`)).status).toBe(404);
  });

  it("o gateway do SDK recusa o widget privado de outra pessoa", async () => {
    const res = await fetch(`${API}/widget-sdk/users/me`, {
      headers: { "X-Api-Key": outra.token, "X-Widget-Id": meuId },
    });
    expect(res.status).toBe(403);
  });

  it("a autora carrega o pacote do próprio widget", async () => {
    expect((await apiClient(autora.token).get(`/widgets/${meuId}/assets/widget.js`)).status).toBe(200);
  });

  it("a aba De usuários é só para quem administra", async () => {
    expect((await apiClient(autora.token).get("/widgets/?scope=users")).status).toBe(403);
    const res = await apiClient(admin.token).get("/widgets/?scope=users");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const meu = body.results.find((w: any) => w.id === meuId);
    expect(meu.owner).toMatchObject({ id: autora.id });
    expect(meu.created_at).toBeTruthy();
    expect(meu.version).toBe("1.0.0");
  });

  it("a aba Globais não mistura widgets de usuários", async () => {
    const res = await apiClient(admin.token).get("/widgets/?scope=global");
    expect(idsDe((await res.json()) as any)).not.toContain(meuId);
  });

  it("quem não administra não torna global", async () => {
    const res = await apiClient(autora.token).post(`/widgets/${meuId}/make-global/`, {});
    expect(res.status).toBe(403);
  });

  it("o admin torna global e o widget passa a aparecer para todos", async () => {
    const res = await apiClient(admin.token).post(`/widgets/${meuId}/make-global/`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.scope).toBe("global");
    expect(body.owner_user_id).toBeNull();

    const lista = await apiClient(outra.token).get("/widgets/?status=ACTIVE");
    expect(idsDe((await lista.json()) as any)).toContain(meuId);
  });

  it("depois de global ele sai do GET /widgets/mine/ da autora", async () => {
    const res = await apiClient(autora.token).get("/widgets/mine/");
    expect(idsDe((await res.json()) as any)).not.toContain(meuId);
  });

  it("tornar global um widget que já é global responde 400", async () => {
    const res = await apiClient(admin.token).post(`/widgets/${meuId}/make-global/`, {});
    expect(res.status).toBe(400);
  });

  it("tornar global com nome e versão já publicados responde 409", async () => {
    const res = await apiClient(outra.token).get("/widgets/mine/");
    const [doOutro] = idsDe((await res.json()) as any);
    const conflito = await apiClient(admin.token).post(`/widgets/${doOutro}/make-global/`, {});
    expect(conflito.status).toBe(409);
  });

  it("a pessoa remove o próprio widget, mas não o de outra", async () => {
    const enviado = await uploadTo("/widgets/mine/", autora.token, buildWidgetZip("Rascunho", "0.1.0"));
    const { id } = (await enviado.json()) as any;
    expect((await apiClient(outra.token).delete(`/widgets/mine/${id}/`)).status).toBe(404);
    expect((await apiClient(autora.token).delete(`/widgets/mine/${id}/`)).status).toBe(204);
    expect((await apiClient(autora.token).get(`/widgets/${id}`)).status).toBe(404);
  });

  it("o admin remove o widget de um usuário", async () => {
    const enviado = await uploadTo("/widgets/mine/", autora.token, buildWidgetZip("Outro", "0.2.0"));
    const { id } = (await enviado.json()) as any;
    expect((await apiClient(admin.token).delete(`/widgets/${id}`)).status).toBe(204);
  });
});
