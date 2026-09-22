/**
 * Regras puras das ligações: token de serviço do PBX, situação em que a ligação
 * entra na caixa, filtro por canal e relatório. Sem banco.
 */
import { describe, expect, test } from "bun:test";
import { PHONE_CHANNEL, WITHOUT_PHONE, isPhoneSession, parseChannelFilter } from "@/canais";
import { buildRelatorioDeLigacoes } from "@/ligacoes/relatorio";
import { resolveSituacaoInicial } from "@/ligacoes/situacao-inicial";
import {
  generateServiceToken,
  hashServiceToken,
  isSameToken,
  lastFour,
  readServiceToken,
} from "@/ligacoes/token-de-servico";

describe("token de serviço do PBX", () => {
  test("nasce com prefixo, é aleatório e só o hash é comparado", () => {
    const token = generateServiceToken();
    expect(token.startsWith("pbx_")).toBe(true);
    expect(token.length).toBeGreaterThan(40);
    expect(generateServiceToken()).not.toBe(token);

    const hash = hashServiceToken(token);
    expect(hash).not.toContain(token);
    expect(isSameToken(token, hash)).toBe(true);
    expect(isSameToken(`${token}x`, hash)).toBe(false);
    expect(isSameToken(token, null)).toBe(false);
    expect(lastFour(token)).toBe(token.slice(-4));
  });

  test("vem no Bearer ou no X-Api-Token", () => {
    expect(readServiceToken({ authorization: "Bearer pbx_abc" })).toBe("pbx_abc");
    expect(readServiceToken({ "x-api-token": "pbx_def" })).toBe("pbx_def");
    expect(readServiceToken(new Headers({ "X-Api-Token": "pbx_ghi" }))).toBe("pbx_ghi");
    expect(readServiceToken({})).toBeNull();
  });
});

describe("situação inicial da ligação", () => {
  const fim = new Date("2026-09-22T13:05:00Z");
  const ana = "ana";

  test("atendida no ramal de alguém já entra em atendimento com essa pessoa", () => {
    expect(resolveSituacaoInicial("answered", ana, fim)).toEqual({
      status: "active",
      assignedAttendantId: ana,
      closedAt: null,
    });
  });

  test("atendida sem ramal conhecido espera alguém assumir", () => {
    expect(resolveSituacaoInicial("answered", null, fim)).toEqual({
      status: "queued",
      assignedAttendantId: null,
      closedAt: null,
    });
  });

  test("não atendida já entra encerrada", () => {
    expect(resolveSituacaoInicial("missed", ana, fim)).toEqual({
      status: "closed",
      assignedAttendantId: ana,
      closedAt: fim,
    });
  });
});

describe("canais", () => {
  test("ligação é o canal phone", () => {
    expect(isPhoneSession({ channel: PHONE_CHANNEL })).toBe(true);
    expect(isPhoneSession({ channel: "whatsapp" })).toBe(false);
    expect(WITHOUT_PHONE).toEqual({ channel: { not: "phone" } });
  });

  test("filtro da lista aceita um ou vários canais conhecidos", () => {
    expect(parseChannelFilter("phone")).toEqual({ channel: { in: ["phone"] } });
    expect(parseChannelFilter("whatsapp,native")).toEqual({ channel: { in: ["whatsapp", "native"] } });
    expect(parseChannelFilter("fax,phone")).toEqual({ channel: { in: ["phone"] } });
    expect(parseChannelFilter(undefined)).toEqual({});
    expect(parseChannelFilter("fax")).toEqual({});
  });
});

const linha = (over: Partial<Parameters<typeof buildRelatorioDeLigacoes>[0][number]>) => ({
  status: "answered" as const,
  concluded: true,
  attendantId: "ana",
  entityId: "e1",
  entityName: "Prefeitura A",
  projectId: "p1",
  projectName: "SIART",
  ...over,
});

describe("relatório de ligações", () => {
  test("conta por atendente, entidade e sistema, do maior para o menor", () => {
    const r = buildRelatorioDeLigacoes([
      linha({}),
      linha({ attendantId: "bia", projectId: "p2", projectName: "ALMOXA" }),
      linha({ attendantId: "bia", status: "missed", concluded: false, entityId: null, entityName: null }),
      linha({ attendantId: null, projectId: null, projectName: null, concluded: false }),
    ]);
    expect(r.total).toBe(4);
    expect(r.answered).toBe(3);
    expect(r.missed).toBe(1);
    expect(r.concluded).toBe(2);
    expect(r.by_attendant).toEqual([
      { id: "bia", count: 2, missed: 1 },
      { id: "ana", count: 1, missed: 0 },
      { id: null, count: 1, missed: 0 },
    ]);
    expect(r.by_entity).toEqual([
      { id: "e1", name: "Prefeitura A", count: 3 },
      { id: null, name: "Sem entidade", count: 1 },
    ]);
    expect(r.by_system).toEqual([
      { id: "p1", name: "SIART", count: 2 },
      { id: "p2", name: "ALMOXA", count: 1 },
      { id: null, name: "Sem sistema", count: 1 },
    ]);
  });

  test("sem ligação, tudo zerado", () => {
    expect(buildRelatorioDeLigacoes([])).toEqual({
      total: 0,
      answered: 0,
      missed: 0,
      concluded: 0,
      by_attendant: [],
      by_entity: [],
      by_system: [],
    });
  });
});
