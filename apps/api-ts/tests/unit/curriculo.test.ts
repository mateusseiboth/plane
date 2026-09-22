/**
 * Currículos: o PDF que o robô recebe, filtros da tela, marcar lido e
 * entrevistado, exclusão definitiva (arquivo + registro) e o prazo de guarda
 * da LGPD. DAO e storage mockados; sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import {
  RETENCAO_PADRAO_DIAS,
  buildCurriculoWhere,
  buildMarcacao,
  isVencido,
  validateCurriculoInput,
  validatePdf,
  validateRetencao,
} from "@modules/curriculo/curriculo.rules";
import { createCurriculoService, type CurriculoDeps } from "@modules/curriculo/curriculo.service";
import { FieldValidationError, NotFoundError } from "@utils/erro-de-dominio";

const WS = "11111111-1111-4111-8111-111111111111";
const AGORA = new Date("2026-09-22T15:00:00.000Z");
const PDF = new Blob(["%PDF-1.7\n..."], { type: "application/pdf" });

describe("validatePdf", () => {
  it("aceita PDF pelo tipo e pelo conteúdo", async () => {
    expect(await validatePdf(PDF)).toEqual([]);
  });

  it("recusa arquivo ausente, que não é PDF ou que só diz ser PDF", async () => {
    expect(await validatePdf(null)).toEqual([{ path: "file", message: "Envie o currículo em PDF." }]);
    expect(await validatePdf(new Blob(["oi"], { type: "text/plain" }))).toEqual([
      { path: "file", message: "O arquivo enviado não é um PDF. Envie o currículo em PDF." },
    ]);
    expect(await validatePdf(new Blob(["MZ..."], { type: "application/pdf" }))).toEqual([
      { path: "file", message: "O arquivo enviado não é um PDF. Envie o currículo em PDF." },
    ]);
  });

  it("recusa PDF acima de 10 MB", async () => {
    const grande = new Blob(["%PDF-", new Uint8Array(10 * 1024 * 1024)], { type: "application/pdf" });
    expect(await validatePdf(grande)).toEqual([{ path: "file", message: "O PDF pode ter até 10 MB." }]);
  });
});

describe("validateCurriculoInput", () => {
  it("nome e vaga são obrigatórios", () => {
    expect(validateCurriculoInput({}).errors).toEqual([
      { path: "name", message: "Informe o nome." },
      { path: "position", message: "Informe a vaga de interesse." },
    ]);
  });

  it("limpa os campos", () => {
    const { data } = validateCurriculoInput({ name: " Ana ", position: " Programador ", phone: "5567", message: "" });
    expect(data).toEqual({ name: "Ana", position: "Programador", phone: "5567", message: null, chatSessionId: null });
  });
});

describe("buildCurriculoWhere", () => {
  it("filtra vaga por trecho, lido e entrevistado", () => {
    expect(buildCurriculoWhere(WS, { position: "prog", read: "false", interviewed: "true" })).toEqual({
      workspaceId: WS,
      position: { contains: "prog", mode: "insensitive" },
      readAt: null,
      interviewedAt: { not: null },
    });
    expect(buildCurriculoWhere(WS, {})).toEqual({ workspaceId: WS });
  });
});

describe("buildMarcacao", () => {
  it("marcar grava quem e quando; desmarcar limpa os dois", () => {
    expect(buildMarcacao({ is_read: true, is_interviewed: false }, "u1", AGORA)).toEqual({
      readAt: AGORA,
      readById: "u1",
      interviewedAt: null,
      interviewedById: null,
    });
    expect(buildMarcacao({}, "u1", AGORA)).toEqual({});
  });
});

describe("retenção", () => {
  it("prazo padrão de um ano", () => {
    expect(RETENCAO_PADRAO_DIAS).toBe(365);
  });

  it("vence depois do prazo, não no dia", () => {
    const recebido = new Date("2025-09-22T15:00:00.000Z");
    expect(isVencido(recebido, 365, AGORA)).toBe(false);
    expect(isVencido(recebido, 364, AGORA)).toBe(true);
  });

  it("prazo entre 30 e 3650 dias, inteiro", () => {
    expect(validateRetencao(180)).toEqual([]);
    expect(validateRetencao(10)).toEqual([
      { path: "retention_days", message: "Informe um prazo entre 30 e 3650 dias." },
    ]);
    expect(validateRetencao("abc")).toHaveLength(1);
    expect(validateRetencao(40.5)).toHaveLength(1);
  });
});

const linha = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  receivedAt: AGORA,
  workspaceId: WS,
  name: "Ana",
  phone: null,
  position: "Programador",
  message: null,
  fileKey: "curriculos/ws/c1.pdf",
  fileName: "curriculo.pdf",
  fileSize: 10,
  chatSessionId: null,
  readAt: null,
  readById: null,
  interviewedAt: null,
  interviewedById: null,
  ...over,
});

const makeService = (over: Record<string, unknown> = {}) => {
  const dao = {
    create: mock(async (data: any) => linha(data)),
    findMany: mock(async () => [linha()]),
    count: mock(async () => 1),
    findOne: mock(async () => linha()),
    update: mock(async (_id: string, data: any) => linha(data)),
    remove: mock(async () => undefined),
    findPositions: mock(async () => ["Programador"]),
    findUsuarios: mock(async () => []),
    findConfig: mock(async () => null),
    saveConfig: mock(async (_ws: string, dias: number) => ({ workspaceId: WS, retentionDays: dias })),
    findRecebidosAntesDe: mock(async () => []),
    findConfigs: mock(async () => []),
    ...over,
  } as unknown as CurriculoDeps["dao"];
  const storage = { save: mock(async () => undefined), remove: mock(async () => undefined) };
  const service = createCurriculoService({ dao, storage, now: () => AGORA, newId: () => "c1" });
  return { service, dao, storage };
};

describe("CurriculoService.create", () => {
  it("guarda o PDF no storage e registra", async () => {
    const { service, dao, storage } = makeService();
    const dto = await service.create(WS, { name: "Ana", position: "Programador" }, PDF, "meu cv.pdf");
    expect((storage.save as any).mock.calls[0][0]).toBe(`curriculos/${WS}/c1.pdf`);
    expect((dao.create as any).mock.calls[0][0]).toMatchObject({
      id: "c1",
      workspaceId: WS,
      fileKey: `curriculos/${WS}/c1.pdf`,
      fileName: "meu cv.pdf",
      fileSize: PDF.size,
    });
    expect(dto).toMatchObject({ id: "c1", name: "Ana", position: "Programador", is_read: false });
  });

  it("não é PDF: recusa sem gravar nada", async () => {
    const { service, dao, storage } = makeService();
    const erro = await service.create(WS, { name: "Ana", position: "X" }, new Blob(["x"]), "x.doc").catch((e) => e);
    expect(erro).toBeInstanceOf(FieldValidationError);
    expect(storage.save).not.toHaveBeenCalled();
    expect(dao.create).not.toHaveBeenCalled();
  });
});

describe("CurriculoService.remove", () => {
  it("exclusão definitiva: apaga o arquivo e o registro", async () => {
    const { service, dao, storage } = makeService();
    await service.remove(WS, "c1");
    expect((storage.remove as any).mock.calls[0][0]).toBe("curriculos/ws/c1.pdf");
    expect((dao.remove as any).mock.calls[0][0]).toBe("c1");
  });

  it("de outro espaço: não encontrado", async () => {
    const { service } = makeService({ findOne: mock(async () => null) });
    expect(service.remove(WS, "c1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("CurriculoService.purgeExpired", () => {
  it("apaga só o que passou do prazo do próprio espaço", async () => {
    const OUTRO = "22222222-2222-4222-8222-222222222222";
    const antigo = linha({ id: "velho", receivedAt: new Date("2026-01-01T00:00:00.000Z") });
    const doOutro = linha({ id: "outro", workspaceId: OUTRO, receivedAt: new Date("2026-01-01T00:00:00.000Z") });
    const { service, dao, storage } = makeService({
      findConfigs: mock(async () => [{ workspaceId: WS, retentionDays: 30 }]),
      findRecebidosAntesDe: mock(async () => [antigo, doOutro]),
    });
    const apagados = await service.purgeExpired();
    // O espaço sem configuração usa o padrão de 365 dias: o de janeiro ainda fica.
    expect(apagados.map((c) => c.id)).toEqual(["velho"]);
    expect((dao.remove as any).mock.calls).toEqual([["velho"]]);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});
