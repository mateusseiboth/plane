/**
 * MuralService: orquestração da publicação (validação, anexo do espaço, sino e
 * tempo real) e da leitura. DAO, sino e barramento mockados; sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { createMuralService, type MuralDeps } from "@modules/mural/mural.service";
import { MuralNotFoundError, MuralValidationError } from "@modules/mural/mural.errors";

const AGORA = new Date("2026-09-22T15:00:00.000Z");
const WS = "11111111-1111-4111-8111-111111111111";
const ANEXO = "22222222-2222-4222-8222-222222222222";

const recadoDoBanco = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  workspaceId: WS,
  authorId: "autor",
  title: "Feriado",
  descriptionHtml: "<p>x</p>",
  descriptionStripped: "x",
  publishedAt: AGORA,
  expiresAt: null,
  isPinned: false,
  isRequired: false,
  isActive: true,
  attachmentId: null,
  createdAt: AGORA,
  updatedAt: AGORA,
  ...over,
});

const makeService = (overrides: Partial<MuralDeps["dao"]> = {}) => {
  const dao = {
    findRecados: mock(async () => []),
    countRecados: mock(async () => 0),
    findVigentes: mock(async () => []),
    findRecado: mock(async () => recadoDoBanco()),
    createRecado: mock(async (data: any) => recadoDoBanco(data)),
    updateRecado: mock(async (_id: string, data: any) => recadoDoBanco(data)),
    findLeiturasDoUsuario: mock(async () => []),
    saveLeitura: mock(async () => undefined),
    findLeiturasDoRecado: mock(async () => []),
    findUsuarios: mock(async () => []),
    findAnexos: mock(async () => []),
    findMembrosAtivos: mock(async () => []),
    ...overrides,
  } as unknown as MuralDeps["dao"];
  const notify = mock(async () => undefined);
  const publish = mock(() => undefined);
  const service = createMuralService({ dao, notify, publish, now: () => AGORA });
  return { service, dao, notify, publish };
};

const pessoa = (id: string) => ({ id, displayName: id, firstName: "", lastName: "", avatarUrl: null, avatar: null });

const ctx = { workspaceId: WS, slug: "ws", userId: "autor", canPublish: true };

describe("create", () => {
  it("grava, avisa o sino e publica no tempo real", async () => {
    const { service, dao, notify, publish } = makeService();
    const dto = await service.create(ctx, { title: "Feriado", description_html: "<p>x</p>" });

    expect(dao.createRecado).toHaveBeenCalledTimes(1);
    expect((dao.createRecado as any).mock.calls[0][0]).toMatchObject({
      workspaceId: WS,
      authorId: "autor",
      title: "Feriado",
    });
    expect(notify).toHaveBeenCalledWith({ workspaceId: WS, recadoId: "r1", actorId: "autor", title: "Feriado" });
    expect(publish).toHaveBeenCalledWith(WS, { entity: "mural", action: "create", id: "r1", actor: "autor" });
    expect(dto.title).toBe("Feriado");
  });

  it("corpo inválido lança erro com os campos e não grava", async () => {
    const { service, dao, notify } = makeService();
    const erro = await service.create(ctx, { title: "" }).catch((e) => e);
    expect(erro).toBeInstanceOf(MuralValidationError);
    expect(erro.status).toBe(400);
    expect(erro.errors.map((e: any) => e.path)).toEqual(["title", "description_html"]);
    expect(dao.createRecado).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("anexo que não é do espaço é recusado no campo", async () => {
    const { service, dao } = makeService({ findAnexos: mock(async () => []) } as any);
    const erro = await service
      .create(ctx, { title: "A", description_html: "<p>x</p>", attachment_id: ANEXO })
      .catch((e) => e);
    expect(erro).toBeInstanceOf(MuralValidationError);
    expect(erro.errors).toEqual([{ path: "attachment_id", message: "Anexo não encontrado." }]);
    expect(dao.createRecado).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  it("publica a alteração no tempo real e não avisa o sino de novo", async () => {
    const { service, notify, publish } = makeService();
    await service.update(ctx, "r1", { is_pinned: true });
    expect(publish).toHaveBeenCalledWith(WS, { entity: "mural", action: "update", id: "r1", actor: "autor" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("recado de outro espaço não existe", async () => {
    const { service } = makeService({ findRecado: mock(async () => null) } as any);
    await expect(service.update(ctx, "r1", { is_pinned: true })).rejects.toBeInstanceOf(MuralNotFoundError);
  });
});

describe("markRead", () => {
  it("grava a leitura de quem abriu", async () => {
    const { service, dao } = makeService();
    await service.markRead({ ...ctx, userId: "leitor", canPublish: false }, "r1");
    expect(dao.saveLeitura).toHaveBeenCalledWith("r1", "leitor");
  });

  it("recado inativo não é encontrado por quem só lê", async () => {
    const { service, dao } = makeService({ findRecado: mock(async () => recadoDoBanco({ isActive: false })) } as any);
    await expect(service.markRead({ ...ctx, canPublish: false }, "r1")).rejects.toBeInstanceOf(MuralNotFoundError);
    expect(dao.saveLeitura).not.toHaveBeenCalled();
  });
});

describe("readers", () => {
  it("separa quem leu de quem não leu entre os membros ativos", async () => {
    const { service } = makeService({
      findMembrosAtivos: mock(async () => [pessoa("a"), pessoa("b"), pessoa("c")]),
      findLeiturasDoRecado: mock(async () => [{ userId: "b", readAt: AGORA }]),
    } as any);
    const r = await service.readers(ctx, "r1");
    expect(r.read.map((p) => p.id)).toEqual(["b"]);
    expect(r.unread.map((p) => p.id)).toEqual(["a", "c"]);
    expect(r.read[0].read_at).toBe(AGORA.toISOString());
  });
});
