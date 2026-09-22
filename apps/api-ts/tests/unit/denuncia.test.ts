/**
 * Denúncia interna: validação, dia sem hora e o ponto crítico, a anônima não
 * leva nada que ligue ao autor (nem id, nem hora, nem evento). DAO mockado; sem banco.
 */
import { describe, expect, it, mock } from "bun:test";
import { formatDiaLocal, validateDenunciaInput } from "@modules/denuncia/denuncia.rules";
import { createDenunciaService, type DenunciaDeps } from "@modules/denuncia/denuncia.service";

const WS = "11111111-1111-4111-8111-111111111111";

describe("formatDiaLocal", () => {
  it("guarda só o dia, no fuso da empresa", () => {
    // 01:30 UTC do dia 23 ainda é dia 22 em Campo Grande (UTC-4).
    expect(formatDiaLocal(new Date("2026-09-23T01:30:00.000Z"), "America/Campo_Grande")).toBe("2026-09-22");
    expect(formatDiaLocal(new Date("2026-09-23T13:59:59.999Z"), "America/Campo_Grande")).toBe("2026-09-23");
  });
});

describe("validateDenunciaInput", () => {
  it("aceita título, descrição e a opção anônima", () => {
    const { data, errors } = validateDenunciaInput({ title: " Assédio ", description: "Relato", is_anonymous: true });
    expect(errors).toEqual([]);
    expect(data).toEqual({ title: "Assédio", description: "Relato", isAnonymous: true });
  });

  it("título e descrição são obrigatórios; título até 200", () => {
    const { errors } = validateDenunciaInput({ title: "x".repeat(201), description: " " });
    expect(errors).toEqual([
      { path: "title", message: "O título pode ter até 200 caracteres." },
      { path: "description", message: "Descreva o que aconteceu." },
    ]);
    expect(validateDenunciaInput({}).errors.map((e) => e.path)).toEqual(["title", "description"]);
  });

  it("sem a opção marcada, não é anônima", () => {
    expect(validateDenunciaInput({ title: "a", description: "b" }).data.isAnonymous).toBe(false);
  });
});

const makeService = (over: Record<string, unknown> = {}) => {
  const dao = {
    create: mock(async (data: any) => ({ id: "d1", ...data })),
    findMany: mock(async () => []),
    count: mock(async () => 0),
    findUsuarios: mock(async () => [{ id: "autor", displayName: "Ana" }]),
    ...over,
  } as unknown as DenunciaDeps["dao"];
  const service = createDenunciaService({
    dao,
    now: () => new Date("2026-09-22T15:47:12.345Z"),
    timeZone: "America/Campo_Grande",
  });
  return { service, dao };
};

describe("DenunciaService.create", () => {
  it("anônima: grava SEM autor e só com o dia", async () => {
    const { service, dao } = makeService();
    const dto = await service.create(
      { workspaceId: WS, userId: "autor" },
      {
        title: "t",
        description: "d",
        is_anonymous: true,
      }
    );
    const gravado = (dao.create as any).mock.calls[0][0];
    expect(gravado).toEqual({
      workspaceId: WS,
      title: "t",
      description: "d",
      isAnonymous: true,
      authorId: null,
      reportedOn: new Date("2026-09-22T00:00:00.000Z"),
    });
    expect(JSON.stringify(gravado)).not.toContain("autor");
    expect(dto).toEqual({ id: "d1", title: "t", is_anonymous: true, reported_on: "2026-09-22" });
  });

  it("identificada: grava o autor, também só com o dia", async () => {
    const { service, dao } = makeService();
    await service.create({ workspaceId: WS, userId: "autor" }, { title: "t", description: "d" });
    expect((dao.create as any).mock.calls[0][0]).toMatchObject({ authorId: "autor", isAnonymous: false });
  });
});

describe("DenunciaService.list", () => {
  it("mostra o autor só da identificada; a anônima vem sem autor", async () => {
    const dia = new Date("2026-09-22T00:00:00.000Z");
    const { service } = makeService({
      findMany: mock(async () => [
        { id: "a", workspaceId: WS, title: "A", description: "x", isAnonymous: true, authorId: null, reportedOn: dia },
        {
          id: "b",
          workspaceId: WS,
          title: "B",
          description: "y",
          isAnonymous: false,
          authorId: "autor",
          reportedOn: dia,
        },
      ]),
      count: mock(async () => 2),
    });
    const pagina = (await service.list(WS, {})) as any;
    expect(pagina.results).toEqual([
      { id: "a", title: "A", description: "x", is_anonymous: true, reported_on: "2026-09-22", author: null },
      {
        id: "b",
        title: "B",
        description: "y",
        is_anonymous: false,
        reported_on: "2026-09-22",
        author: { id: "autor", display_name: "Ana" },
      },
    ]);
  });
});
