/**
 * Mural de recados pela API de verdade: publicação pela matriz (`mural.publish`),
 * leitura por qualquer membro, home, aviso obrigatório, confirmação de leitura,
 * histórico por período, anexo e o aviso no sino.
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { seedWorkflowRoles } from "@utils/permissions";
import { cleanDb } from "@tests/helpers/setup";
import { apiClient, createApiToken, createMemberWithToken, createUser, createWorkspace } from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;

describe("mural de recados", () => {
  let slug: string;
  let wsId: string;
  let admin: Client;
  let gestor: Client;
  let gestorId: string;
  let ti: Client;
  let tiId: string;
  let guest: Client;
  let guestId: string;
  let estranho: Client;

  const base = () => `/workspaces/${slug}/mural`;
  const publish = async (client: Client, body: Record<string, unknown> = {}) => {
    const res = await client.post(`${base()}/`, { title: "Recado", description_html: "<p>Texto</p>", ...body });
    return { res, body: (await res.json()) as any };
  };

  beforeAll(async () => {
    await cleanDb();
    const owner = await createUser();
    const ws = await createWorkspace(owner.id);
    slug = ws.slug;
    wsId = ws.id;
    admin = apiClient((await createApiToken(owner.id)).token);
    const g = await createMemberWithToken(ws.id, 18);
    gestor = apiClient(g.token);
    gestorId = g.user.id;
    const t = await createMemberWithToken(ws.id, 12);
    ti = apiClient(t.token);
    tiId = t.user.id;
    const v = await createMemberWithToken(ws.id, 5);
    guest = apiClient(v.token);
    guestId = v.user.id;
    await seedWorkflowRoles(prisma, ws.id);

    const outro = await createUser();
    const outroWs = await createWorkspace(outro.id);
    await seedWorkflowRoles(prisma, outroWs.id);
    estranho = apiClient((await createApiToken(outro.id)).token);
  });

  afterAll(() => cleanDb());

  it("Gestor publica e o recado volta no contrato da tela", async () => {
    const { res, body } = await publish(gestor, { title: "Feriado", is_pinned: true });
    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      title: "Feriado",
      description_html: "<p>Texto</p>",
      is_pinned: true,
      is_required: false,
      is_active: true,
      is_expired: false,
      expires_at: null,
      attachment: null,
      is_read: false,
    });
    expect(body.author.id).toBe(gestorId);
    expect(typeof body.published_at).toBe("string");
  });

  it("TI não publica, não edita e não vê quem leu", async () => {
    const { body: recado } = await publish(gestor);
    expect((await publish(ti)).res.status).toBe(403);
    expect((await ti.patch(`${base()}/${recado.id}/`, { is_active: false })).status).toBe(403);
    expect((await ti.get(`${base()}/${recado.id}/readers/`)).status).toBe(403);
  });

  it("concessão por pessoa libera a publicação para o TI", async () => {
    const put = await admin.put(`/workspaces/${slug}/roles/members/${tiId}/`, {
      granted: ["mural.publish"],
      revoked: [],
    });
    expect(put.status).toBe(200);
    expect((await publish(ti)).res.status).toBe(201);
    await admin.put(`/workspaces/${slug}/roles/members/${tiId}/`, { granted: [], revoked: [] });
  });

  it("recado sem título volta 400 com o campo", async () => {
    const { res, body } = await publish(gestor, { title: "" });
    expect(res.status).toBe(400);
    expect(body.errors).toEqual([{ path: "title", message: "Informe o título do recado." }]);
  });

  it("quem não é do espaço não lê o mural", async () => {
    expect((await estranho.get(`${base()}/`)).status).toBe(403);
  });

  it("todo membro lê: a home traz os não lidos primeiro e abrir grava a leitura", async () => {
    const { body: velho } = await publish(gestor, { title: "Velho" });
    const { body: novo } = await publish(gestor, { title: "Novo" });

    const antes = (await (await guest.get(`${base()}/home/`)).json()) as any[];
    expect(antes.every((r) => r.is_read === false)).toBe(true);

    expect((await guest.post(`${base()}/${velho.id}/read/`, {})).status).toBe(204);
    // ler duas vezes não quebra nem duplica
    expect((await guest.post(`${base()}/${velho.id}/read/`, {})).status).toBe(204);

    const depois = (await (await guest.get(`${base()}/home/`)).json()) as any[];
    const ids = depois.map((r) => r.id);
    expect(ids.indexOf(novo.id)).toBeLessThan(ids.indexOf(velho.id));
    expect(depois.find((r) => r.id === velho.id).is_read).toBe(true);
  });

  it("quem publica vê quem leu e quem não leu", async () => {
    const { body: recado } = await publish(gestor, { title: "Confirmação" });
    await guest.post(`${base()}/${recado.id}/read/`, {});

    const res = await gestor.get(`${base()}/${recado.id}/readers/`);
    expect(res.status).toBe(200);
    const leitores = (await res.json()) as any;
    expect(leitores.read.map((p: any) => p.id)).toEqual([guestId]);
    expect(typeof leitores.read[0].read_at).toBe("string");
    expect(leitores.unread.map((p: any) => p.id)).toContain(tiId);
    expect(leitores.unread.map((p: any) => p.id)).not.toContain(guestId);
  });

  it("recado obrigatório fica pendente até a leitura ser confirmada", async () => {
    const { body: recado } = await publish(gestor, { title: "Leia", is_required: true });
    const pendentes = (await (await guest.get(`${base()}/pending-required/`)).json()) as any[];
    expect(pendentes.map((r) => r.id)).toContain(recado.id);

    await guest.post(`${base()}/${recado.id}/read/`, {});
    const depois = (await (await guest.get(`${base()}/pending-required/`)).json()) as any[];
    expect(depois.map((r) => r.id)).not.toContain(recado.id);
  });

  it("inativado some da home e do histórico de quem lê; quem publica ainda o vê", async () => {
    const { body: recado } = await publish(gestor, { title: "Inativar", is_required: true });
    const patch = await gestor.patch(`${base()}/${recado.id}/`, { is_active: false });
    expect(patch.status).toBe(200);
    expect(((await patch.json()) as any).is_active).toBe(false);

    const home = (await (await guest.get(`${base()}/home/`)).json()) as any[];
    expect(home.map((r) => r.id)).not.toContain(recado.id);
    const pendentes = (await (await guest.get(`${base()}/pending-required/`)).json()) as any[];
    expect(pendentes.map((r) => r.id)).not.toContain(recado.id);
    const historico = (await (await guest.get(`${base()}/?inactive=true`)).json()) as any;
    expect(historico.results.map((r: any) => r.id)).not.toContain(recado.id);
    expect((await guest.get(`${base()}/${recado.id}/`)).status).toBe(404);

    const doGestor = (await (await gestor.get(`${base()}/?inactive=true`)).json()) as any;
    expect(doGestor.results.map((r: any) => r.id)).toContain(recado.id);
  });

  it("vencido sai da home mas fica no histórico marcado", async () => {
    const { body: recado } = await publish(gestor, { title: "Vencido" });
    await prisma.muralRecado.update({ where: { id: recado.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

    const home = (await (await guest.get(`${base()}/home/`)).json()) as any[];
    expect(home.map((r) => r.id)).not.toContain(recado.id);
    const historico = (await (await guest.get(`${base()}/`)).json()) as any;
    expect(historico.results.find((r: any) => r.id === recado.id).is_expired).toBe(true);
  });

  it("histórico filtra por período e pagina", async () => {
    const { body: recado } = await publish(gestor, { title: "Janeiro" });
    await prisma.muralRecado.update({
      where: { id: recado.id },
      data: { publishedAt: new Date("2026-01-10T15:00:00Z") },
    });

    const res = await guest.get(`${base()}/?desde=2026-01-01&ate=2026-01-31`);
    const pagina = (await res.json()) as any;
    expect(pagina.results.map((r: any) => r.id)).toEqual([recado.id]);

    const primeira = (await (await guest.get(`${base()}/?per_page=2`)).json()) as any;
    expect(primeira.results).toHaveLength(2);
    expect(primeira.next_page_results).toBe(true);
  });

  it("anexo do próprio espaço aparece com nome; de outro espaço é recusado", async () => {
    const anexo = await prisma.fileAsset.create({
      data: {
        workspaceId: wsId,
        asset: `ws/${wsId}/cartaz.pdf`,
        size: 10,
        attributes: { name: "cartaz.pdf" },
        isUploaded: true,
      },
    });
    const { res, body } = await publish(gestor, { title: "Com anexo", attachment_id: anexo.id });
    expect(res.status).toBe(201);
    expect(body.attachment).toMatchObject({ id: anexo.id, name: "cartaz.pdf", size: 10 });
    expect(body.attachment.url).toBe(`/api/assets/v2/workspaces/${slug}/${anexo.id}/`);

    const alheio = await prisma.fileAsset.create({ data: { asset: "x/y.pdf", attributes: {} } });
    const recusado = await publish(gestor, { attachment_id: alheio.id });
    expect(recusado.res.status).toBe(400);
    expect(recusado.body.errors[0].path).toBe("attachment_id");
  });

  it("recado novo avisa no sino os membros, menos quem publicou", async () => {
    const { body: recado } = await publish(gestor, { title: "Sino" });
    const doGuest = await prisma.notification.findMany({ where: { receiverId: guestId, entityId: recado.id } });
    expect(doGuest).toHaveLength(1);
    expect(doGuest[0]).toMatchObject({ entity: "mural", title: "Novo recado no mural", message: "Sino" });
    const doAutor = await prisma.notification.count({ where: { receiverId: gestorId, entityId: recado.id } });
    expect(doAutor).toBe(0);

    const lista = (await (await guest.get(`/workspaces/${slug}/users/notifications/`)).json()) as any;
    expect(lista.results.find((n: any) => n.entity_identifier === recado.id).entity_name).toBe("mural");
  });

  it("recado de outro espaço não é encontrado", async () => {
    const { body: recado } = await publish(gestor);
    const outroSlug = (await prisma.workspace.findFirst({ where: { id: { not: wsId } } }))!.slug;
    expect((await estranho.get(`/workspaces/${outroSlug}/mural/${recado.id}/`)).status).toBe(404);
  });
});
