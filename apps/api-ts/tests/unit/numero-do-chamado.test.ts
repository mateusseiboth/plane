/**
 * Número anual do chamado ("12-2026"): geração no banco (gatilho em `issues`),
 * reinício a cada ano, contador por espaço de trabalho, número legado do SAC,
 * concorrência, backfill idempotente e a leitura/escrita da grafia em
 * @utils/numero-do-chamado. Usa o banco de teste de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import prisma from "@db";
import { cleanDb } from "@tests/helpers/setup";
import { createIssue, createProject, createUser, createWorkspace } from "@tests/helpers/factory";
import { backfillNumerosDosChamados, formatNumeroDoChamado, parseNumeroDoChamado } from "@utils/numero-do-chamado";
import { serializeIssue } from "@utils/serialize";

const ANO_ATUAL = Number(
  new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date())
);

describe("formatNumeroDoChamado", () => {
  it("monta N-AAAA", () => {
    expect(formatNumeroDoChamado({ ticketSequence: 12, ticketYear: 2026 })).toBe("12-2026");
  });

  it("devolve null enquanto o chamado não tem número", () => {
    expect(formatNumeroDoChamado({ ticketSequence: null, ticketYear: null })).toBeNull();
    expect(formatNumeroDoChamado({})).toBeNull();
  });
});

describe("parseNumeroDoChamado", () => {
  it("lê as grafias que a pessoa digita", () => {
    for (const digitado of ["12-2026", " 12-2026 ", "12/2026", "12 2026", "12.2026", "#12-2026", "122026"]) {
      expect(parseNumeroDoChamado(digitado)).toEqual({ sequencial: 12, ano: 2026 });
    }
  });

  it("recusa o que não tem cara de número do chamado", () => {
    for (const digitado of ["12", "ALMOXA-12", "12-26", "abc", "", "12-1850"]) {
      expect(parseNumeroDoChamado(digitado)).toBeNull();
    }
  });
});

describe("numeração no banco", () => {
  let workspaceA: string;
  let workspaceB: string;
  let projetoA: string;
  let projetoA2: string;
  let projetoB: string;

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    const wsA = await createWorkspace(user.id);
    const wsB = await createWorkspace(user.id);
    workspaceA = wsA.id;
    workspaceB = wsB.id;
    projetoA = (await createProject(wsA.id, user.id)).id;
    projetoA2 = (await createProject(wsA.id, user.id)).id;
    projetoB = (await createProject(wsB.id, user.id)).id;
  });

  afterAll(() => cleanDb());

  it("todo chamado criado ganha um número, sem o caminho de criação precisar lembrar", async () => {
    const primeiro = await createIssue(projetoA, workspaceA);
    const segundo = await createIssue(projetoA, workspaceA);
    expect(primeiro.ticketYear).toBe(ANO_ATUAL);
    expect(primeiro.ticketSequence).toBe(1);
    expect(segundo.ticketSequence).toBe(2);
  });

  it("o contador é do espaço de trabalho, não do projeto", async () => {
    const outroProjeto = await createIssue(projetoA2, workspaceA);
    expect(outroProjeto.ticketSequence).toBe(3);
  });

  it("cada espaço de trabalho tem a sua própria contagem", async () => {
    const noOutro = await createIssue(projetoB, workspaceB);
    expect(noOutro.ticketSequence).toBe(1);
  });

  it("o ano é o da abertura e a contagem reinicia a cada ano", async () => {
    const antigo = await prisma.issue.create({
      data: {
        projectId: projetoA,
        workspaceId: workspaceA,
        name: "De 2024",
        createdAt: new Date("2024-06-10T15:00:00Z"),
      },
    });
    expect(antigo.ticketYear).toBe(2024);
    expect(antigo.ticketSequence).toBe(1);
  });

  it("a virada do ano segue o horário de Brasília", async () => {
    // 31/12/2024 22h em Brasília já é 2025 em UTC.
    const reveillon = await prisma.issue.create({
      data: {
        projectId: projetoA,
        workspaceId: workspaceA,
        name: "Réveillon",
        createdAt: new Date("2025-01-01T01:00:00Z"),
      },
    });
    expect(reveillon.ticketYear).toBe(2024);
    expect(reveillon.ticketSequence).toBe(2);
  });

  it("chamado migrado fica com o número legado, e a contagem continua depois dele", async () => {
    const migrado = await createIssue(projetoA, workspaceA, { legacyTicketNumber: "500-2023" });
    expect(migrado.ticketSequence).toBe(500);
    expect(migrado.ticketYear).toBe(2023);

    const seguinte = await prisma.issue.create({
      data: {
        projectId: projetoA,
        workspaceId: workspaceA,
        name: "Depois",
        createdAt: new Date("2023-11-01T12:00:00Z"),
      },
    });
    expect(seguinte.ticketSequence).toBe(501);
  });

  it("número legado fora do padrão N-AAAA não é aproveitado: o chamado ganha um número novo", async () => {
    const estranho = await createIssue(projetoA, workspaceA, { legacyTicketNumber: "458325" });
    expect(estranho.ticketYear).toBe(ANO_ATUAL);
    expect(estranho.ticketSequence).toBeGreaterThan(0);
  });

  it("criações simultâneas nunca repetem número", async () => {
    const criados = await Promise.all(Array.from({ length: 25 }, () => createIssue(projetoB, workspaceB)));
    const numeros = new Set(criados.map((c) => c.ticketSequence));
    expect(numeros.size).toBe(25);
  });

  it("o serializer entrega o número pronto para a tela", async () => {
    const chamado = await createIssue(projetoB, workspaceB);
    expect(serializeIssue(chamado).ticket_number).toBe(`${chamado.ticketSequence}-${ANO_ATUAL}`);
  });

  describe("backfill", () => {
    it("numera o que ficou sem número, respeitando legado e ordem de abertura, e é idempotente", async () => {
      const user = await createUser();
      const ws = await createWorkspace(user.id);
      const projeto = (await createProject(ws.id, user.id)).id;
      const criar = (nome: string, quando: string, legado: string | null = null) =>
        prisma.issue.create({
          data: {
            projectId: projeto,
            workspaceId: ws.id,
            name: nome,
            createdAt: new Date(quando),
            legacyTicketNumber: legado,
          },
        });
      const [b, a, legado] = [
        await criar("B", "2022-05-02T12:00:00Z"),
        await criar("A", "2022-05-01T12:00:00Z"),
        await criar("L", "2022-01-01T12:00:00Z", "40-2022"),
      ];
      // Simula a base de antes da migração: nenhum chamado numerado, contador vazio.
      await prisma.issue.updateMany({
        where: { workspaceId: ws.id },
        data: { ticketSequence: null, ticketYear: null },
      });
      await prisma.$executeRaw`DELETE FROM issue_ticket_counters WHERE workspace_id = ${ws.id}::uuid`;

      expect(await backfillNumerosDosChamados()).toBeGreaterThanOrEqual(3);

      const numero = async (id: string) => {
        const i = await prisma.issue.findUniqueOrThrow({ where: { id } });
        return formatNumeroDoChamado(i);
      };
      expect(await numero(legado.id)).toBe("40-2022");
      expect(await numero(a.id)).toBe("41-2022");
      expect(await numero(b.id)).toBe("42-2022");

      expect(await backfillNumerosDosChamados()).toBe(0);
      const novo = await criar("Novo", "2022-06-01T12:00:00Z");
      expect(novo.ticketSequence).toBe(43);
    });
  });
});
