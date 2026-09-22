/**
 * Ouvidoria: validação do que o robô manda, filtros da tela, e o service
 * (CNPJ que identifica a entidade, marcar como lida guardando quem e quando,
 * contador de não lidas). DAO mockado; sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { buildOuvidoriaWhere, validateOuvidoriaInput } from "@modules/ouvidoria/ouvidoria.rules";
import { createOuvidoriaService, type OuvidoriaDeps } from "@modules/ouvidoria/ouvidoria.service";
import { FieldValidationError, NotFoundError } from "@utils/erro-de-dominio";

const WS = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-09-22T15:00:00.000Z");

const valido = {
  kind: "reclamacao",
  cnpj: "12.345.678/0001-90",
  name: "Maria",
  message: "O sistema caiu.",
  phone: "5567999990000",
};

describe("validateOuvidoriaInput", () => {
  it("aceita o registro do robô e deixa o CNPJ só com dígitos", () => {
    const { data, errors } = validateOuvidoriaInput(valido);
    expect(errors).toEqual([]);
    expect(data).toMatchObject({
      kind: "reclamacao",
      cnpj: "12345678000190",
      name: "Maria",
      message: "O sistema caiu.",
    });
  });

  it("recusa tipo fora do catálogo, CNPJ sem 14 dígitos, nome e mensagem vazios", () => {
    const { errors } = validateOuvidoriaInput({ kind: "elogio", cnpj: "123", name: " ", message: "" });
    expect(errors.map((e) => e.path).sort()).toEqual(["cnpj", "kind", "message", "name"]);
    expect(errors.find((e) => e.path === "cnpj")?.message).toBe("Informe o CNPJ com 14 números.");
  });

  it("nenhuma mensagem leva travessão", () => {
    const { errors } = validateOuvidoriaInput({});
    for (const e of errors) expect(e.message).not.toContain("—");
  });
});

describe("buildOuvidoriaWhere", () => {
  it("sem filtro: todo o espaço", () => {
    expect(buildOuvidoriaWhere(WS, {})).toEqual({ workspaceId: WS });
  });

  it("filtra por tipo e por lida", () => {
    expect(buildOuvidoriaWhere(WS, { kind: "sugestao", read: "false" })).toEqual({
      workspaceId: WS,
      kind: "sugestao",
      readAt: null,
    });
    expect(buildOuvidoriaWhere(WS, { read: "true" })).toEqual({ workspaceId: WS, readAt: { not: null } });
  });

  it("ignora tipo desconhecido", () => {
    expect(buildOuvidoriaWhere(WS, { kind: "x" })).toEqual({ workspaceId: WS });
  });
});

const linha = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  createdAt: AGORA,
  workspaceId: WS,
  kind: "reclamacao",
  entityId: "e1",
  cnpj: "12345678000190",
  name: "Maria",
  phone: null,
  message: "x",
  chatSessionId: null,
  protocol: null,
  readAt: null,
  readById: null,
  ...over,
});

const makeService = (over: Record<string, unknown> = {}) => {
  const dao = {
    findEntidadePorCnpj: mock(async () => ({ id: "e1", name: "Prefeitura" })),
    create: mock(async (data: any) => linha(data)),
    findMany: mock(async () => [linha()]),
    count: mock(async () => 1),
    findOne: mock(async () => linha()),
    markRead: mock(async (_id: string, data: any) => linha(data)),
    findEntidades: mock(async () => [{ id: "e1", name: "Prefeitura" }]),
    findUsuarios: mock(async () => [{ id: "u1", displayName: "Ana" }]),
    ...over,
  } as unknown as OuvidoriaDeps["dao"];
  const publish = mock(() => undefined);
  const service = createOuvidoriaService({ dao, publish, now: () => AGORA });
  return { service, dao, publish };
};

describe("OuvidoriaService.create", () => {
  it("resolve a entidade pelo CNPJ, grava e avisa a tela", async () => {
    const { service, dao, publish } = makeService();
    const dto = await service.create(WS, valido);
    expect((dao.create as any).mock.calls[0][0]).toMatchObject({
      workspaceId: WS,
      entityId: "e1",
      cnpj: "12345678000190",
    });
    expect(dto).toMatchObject({
      kind: "reclamacao",
      kind_label: "Reclamação",
      entity: { id: "e1", name: "Prefeitura" },
    });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("CNPJ que não é de entidade do espaço volta no campo cnpj", async () => {
    const { service, dao } = makeService({ findEntidadePorCnpj: mock(async () => null) });
    const erro = await service.create(WS, valido).catch((e) => e);
    expect(erro).toBeInstanceOf(FieldValidationError);
    expect(erro.errors).toEqual([
      { path: "cnpj", message: "CNPJ não encontrado. Confira os números e envie de novo." },
    ]);
    expect(dao.create).not.toHaveBeenCalled();
  });
});

describe("OuvidoriaService.markRead", () => {
  it("grava quem leu e quando", async () => {
    const { service, dao } = makeService();
    const dto = await service.markRead({ workspaceId: WS, userId: "u1" }, "o1");
    expect((dao.markRead as any).mock.calls[0]).toEqual(["o1", { readAt: AGORA, readById: "u1" }]);
    expect(dto.read_by).toEqual({ id: "u1", display_name: "Ana" });
  });

  it("já lida: mantém o primeiro leitor", async () => {
    const { service, dao } = makeService({ findOne: mock(async () => linha({ readAt: AGORA, readById: "u9" })) });
    await service.markRead({ workspaceId: WS, userId: "u1" }, "o1");
    expect(dao.markRead).not.toHaveBeenCalled();
  });

  it("de outro espaço: não encontrada", async () => {
    const { service } = makeService({ findOne: mock(async () => null) });
    expect(service.markRead({ workspaceId: WS, userId: "u1" }, "o1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("OuvidoriaService.countUnread", () => {
  it("conta só as não lidas do espaço", async () => {
    const { service, dao } = makeService({ count: mock(async () => 3) });
    expect(await service.countUnread(WS)).toEqual({ count: 3 });
    expect((dao.count as any).mock.calls[0][0]).toEqual({ workspaceId: WS, readAt: null });
  });
});
