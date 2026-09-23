/**
 * Backups atrasados do painel do mapa: as regras do legado (sistema do banco de
 * integração, data no fuso do legado, corte da meia-noite) e a lista que a
 * lateral mostra. Puro — sem MySQL.
 */
import { describe, expect, it } from "bun:test";
import {
  buildAtrasadosDoLegado,
  buildStaleSince,
  normalizeSistemaBackup,
  parseDataHoraLegado,
  readUltimoEnvioPorPar,
  buildCodigoIdentidade,
  NOMES_FIXOS_DOS_SISTEMAS,
} from "@modules/painel-tv/backups/legado";
import { buildBackupsAtrasados } from "@modules/painel-tv/backups/atrasados";

const AGORA = new Date("2026-09-22T15:00:00.000Z");
const TZ = "-04:00";

describe("regras do legado", () => {
  it("todo sistema do banco de integração conta como o sistema 8", () => {
    for (const sistema of ["8", "9", "10", "11", "12", "13", "15", "18", "21", "22", "23"]) {
      expect(normalizeSistemaBackup(sistema)).toBe("8");
    }
    expect(normalizeSistemaBackup("3")).toBe("3");
  });

  it("a data do MySQL é lida no fuso do legado", () => {
    expect(parseDataHoraLegado("2022-12-01 09:31:54", TZ)).toBe("2022-12-01T13:31:54.000Z");
    expect(parseDataHoraLegado("0000-00-00 00:00:00", TZ)).toBeNull();
    expect(parseDataHoraLegado("sem data", TZ)).toBeNull();
  });

  it("atrasado é o que não chegou desde a meia-noite local de ontem", () => {
    expect(buildStaleSince(AGORA, 1, TZ).toISOString()).toBe("2026-09-21T04:00:00.000Z");
    expect(buildStaleSince(AGORA, 3, TZ).toISOString()).toBe("2026-09-19T04:00:00.000Z");
  });

  it("guarda um envio por entidade e sistema: o mais recente", () => {
    const ultimos = readUltimoEnvioPorPar([
      { id: "1", id_entidade: "7", id_sistema: "9", datahora_envio: "2022-11-30 08:00:00" },
      { id: "2", id_entidade: "7", id_sistema: "11", datahora_envio: "2022-12-01 09:00:00" },
      { id: "3", id_entidade: "7", id_sistema: "3", datahora_envio: "2022-10-01 09:00:00" },
    ]);
    expect([...ultimos.keys()].toSorted()).toEqual(["7|3", "7|8"]);
    expect(ultimos.get("7|8")!.id).toBe("2");
  });
});

describe("atrasados do MySQL legado", () => {
  const entidades = [
    { id: "uuid-a", nome: "Prefeitura de Selvíria", legacyId: 42 },
    { id: "uuid-b", nome: "Câmara de Corguinho", legacyId: 7 },
    { id: "uuid-c", nome: "Entidade nova do Plane", legacyId: null },
  ];
  const codigoPorLegado = new Map([
    [42, "204"],
    [7, "12"],
  ]);
  const nomes = new Map([["3", "SIART"]]);

  const atrasados = (envios: { id: string; id_entidade: string; id_sistema: string; datahora_envio: string }[]) =>
    buildAtrasadosDoLegado({
      entidades,
      codigoPorLegado,
      envios,
      nomes,
      staleSince: buildStaleSince(AGORA, 1, TZ),
      tz: TZ,
    });

  it("sem a intranet, o código é o próprio id legado da entidade e os nomes dos sistemas são os fixos", () => {
    const identidade = buildCodigoIdentidade(entidades);
    expect([...identidade.entries()]).toEqual([
      [42, "42"],
      [7, "7"],
    ]);
    expect(NOMES_FIXOS_DOS_SISTEMAS.get("1")).toBe("Contabilidade");
    expect(NOMES_FIXOS_DOS_SISTEMAS.get("3")).toBe("ARH");
    expect(NOMES_FIXOS_DOS_SISTEMAS.get("4")).toBe("SIART");
    const lista = buildAtrasadosDoLegado({
      entidades,
      codigoPorLegado: identidade,
      envios: [{ id: "1", id_entidade: "42", id_sistema: "3", datahora_envio: "2022-12-01 09:31:54" }],
      nomes: NOMES_FIXOS_DOS_SISTEMAS,
      staleSince: buildStaleSince(AGORA, 1, TZ),
      tz: TZ,
    });
    expect(lista.map((l) => [l.entityId, l.sistema])).toEqual([["uuid-a", "ARH"]]);
  });

  it("liga o envio à entidade do Plane pelo código do SAC e nomeia o sistema", () => {
    const lista = atrasados([
      { id: "1", id_entidade: "204", id_sistema: "9", datahora_envio: "2022-12-01 09:31:54" },
      { id: "2", id_entidade: "12", id_sistema: "3", datahora_envio: "2022-10-01 09:31:54" },
    ]);
    expect(lista).toEqual([
      {
        entityId: "uuid-a",
        entidade: "Prefeitura de Selvíria",
        sistema: "Integração",
        ultimoEm: "2022-12-01T13:31:54.000Z",
      },
      { entityId: "uuid-b", entidade: "Câmara de Corguinho", sistema: "SIART", ultimoEm: "2022-10-01T13:31:54.000Z" },
    ]);
  });

  it("backup do dia não entra na lista", () => {
    const hoje = atrasados([{ id: "1", id_entidade: "204", id_sistema: "3", datahora_envio: "2026-09-22 08:00:00" }]);
    expect(hoje).toEqual([]);
  });

  it("envio de entidade que não existe no Plane é ignorado", () => {
    expect(
      atrasados([{ id: "1", id_entidade: "999", id_sistema: "3", datahora_envio: "2020-01-01 08:00:00" }])
    ).toEqual([]);
  });

  it("sistema fora dos quatro do painel não conta como backup", () => {
    const lista = atrasados([{ id: "1", id_entidade: "204", id_sistema: "77", datahora_envio: "2020-01-01 08:00:00" }]);
    expect(lista).toEqual([]);
  });

  it("o atraso é da ENTIDADE: um sistema em dia basta, mesmo com outro parado há anos", () => {
    const lista = atrasados([
      { id: "1", id_entidade: "204", id_sistema: "3", datahora_envio: "2026-09-22 08:00:00" },
      { id: "2", id_entidade: "204", id_sistema: "4", datahora_envio: "2020-01-01 08:00:00" },
    ]);
    expect(lista).toEqual([]);
  });

  it("com todos os sistemas parados, vale o envio mais recente da entidade e o sistema dele", () => {
    const lista = atrasados([
      { id: "1", id_entidade: "204", id_sistema: "4", datahora_envio: "2022-10-01 09:31:54" },
      { id: "2", id_entidade: "204", id_sistema: "3", datahora_envio: "2022-12-01 09:31:54" },
    ]);
    expect(lista).toEqual([
      {
        entityId: "uuid-a",
        entidade: "Prefeitura de Selvíria",
        sistema: "SIART",
        ultimoEm: "2022-12-01T13:31:54.000Z",
      },
    ]);
  });
});

describe("lista da lateral", () => {
  const atraso = (dias: number, entidade: string) => ({
    entityId: entidade,
    entidade,
    sistema: "Integração",
    ultimoEm: new Date(AGORA.getTime() - dias * 86_400_000).toISOString(),
  });

  it("ordena do mais atrasado para o menos e corta no limite, mas conta o total", () => {
    const lista = buildBackupsAtrasados([atraso(2, "A"), atraso(40, "B"), atraso(9, "C")], {
      agora: AGORA,
      limite: 2,
    });
    expect(lista.total).toBe(3);
    expect(lista.itens.map((i) => i.entidade)).toEqual(["B", "C"]);
    expect(lista.itens[0]).toMatchObject({ dias: 40, gravidade: "critico", sistema: "Integração" });
  });

  it("classifica a gravidade pelo tamanho do atraso", () => {
    const lista = buildBackupsAtrasados([atraso(2, "A"), atraso(6, "B"), atraso(30, "C")], { agora: AGORA });
    expect(lista.itens.map((i) => i.gravidade)).toEqual(["critico", "alerta", "atencao"]);
  });

  it("sem data de envio, o atraso é desconhecido e a entidade vem primeiro", () => {
    const lista = buildBackupsAtrasados(
      [atraso(3, "A"), { entityId: "B", entidade: "B", sistema: "SIART", ultimoEm: null }],
      { agora: AGORA }
    );
    expect(lista.itens[0]).toMatchObject({ entidade: "B", dias: null, gravidade: "critico", ultimo_em: null });
  });

  it("lista vazia é lista vazia (a tela mostra 'Sem dados de backup')", () => {
    expect(buildBackupsAtrasados([], { agora: AGORA })).toEqual({ total: 0, itens: [] });
  });
});
