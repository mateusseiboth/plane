/**
 * "Alterar sistema" do chamado: regras puras, sem banco. Qual etapa recebe o
 * chamado novo no destino, qual etapa recebe o antigo (cancelados), como as
 * etiquetas são casadas por nome e quando o pedido é recusado.
 */
import { describe, expect, it } from "bun:test";
import {
  MENSAGENS_DE_ALTERAR_SISTEMA,
  buildIdentificador,
  buildPlanoDeEtiquetas,
  findEtapaCancelada,
  pickEtapaInicial,
  requireDestinoValido,
  requireNaoMovido,
} from "@modules/issue/alterar-sistema.rules";

const etapa = (
  id: string,
  name: string,
  group: string,
  extra: Partial<{ default: boolean; sequence: number }> = {}
) => ({
  id,
  name,
  group,
  default: extra.default ?? false,
  sequence: extra.sequence ?? 1000,
});

const DESTINO = [
  etapa("triagem", "Triagem", "triage", { sequence: 1 }),
  etapa("backlog", "Backlog", "backlog", { default: true, sequence: 2 }),
  etapa("fazendo", "Em desenvolvimento", "started", { sequence: 3 }),
  etapa("teste", "Em Teste", "started", { sequence: 4 }),
  etapa("cancelado", "Cancelado", "cancelled", { sequence: 9 }),
];

describe("pickEtapaInicial", () => {
  it("prefere a etapa de mesmo nome, sem diferenciar maiúsculas", () => {
    expect(pickEtapaInicial(DESTINO, { name: "em teste", group: "started" })?.id).toBe("teste");
  });

  it("sem o mesmo nome, usa a primeira etapa do mesmo grupo", () => {
    expect(pickEtapaInicial(DESTINO, { name: "Codificando", group: "started" })?.id).toBe("fazendo");
  });

  it("sem nome nem grupo iguais, usa a etapa padrão do destino", () => {
    expect(pickEtapaInicial(DESTINO, { name: "Pronto", group: "completed" })?.id).toBe("backlog");
  });

  it("chamado sem etapa vai para a padrão", () => {
    expect(pickEtapaInicial(DESTINO, null)?.id).toBe("backlog");
  });

  it("destino sem etapa padrão usa a primeira pela ordem", () => {
    const semPadrao = DESTINO.map((e) => ({ ...e, default: false })).toReversed();
    expect(pickEtapaInicial(semPadrao, { name: "Pronto", group: "completed" })?.id).toBe("triagem");
  });

  it("destino sem etapa nenhuma devolve null", () => {
    expect(pickEtapaInicial([], { name: "Backlog", group: "backlog" })).toBeNull();
  });
});

describe("findEtapaCancelada", () => {
  it("acha a etapa do grupo cancelados", () => {
    expect(findEtapaCancelada(DESTINO)?.id).toBe("cancelado");
  });

  it("com mais de uma, fica a primeira pela ordem", () => {
    const duas = [
      etapa("b", "Recusado", "cancelled", { sequence: 20 }),
      etapa("a", "Cancelado", "cancelled", { sequence: 10 }),
    ];
    expect(findEtapaCancelada(duas)?.id).toBe("a");
  });

  it("sem etapa de cancelados devolve null", () => {
    expect(findEtapaCancelada(DESTINO.filter((e) => e.group !== "cancelled"))).toBeNull();
  });
});

describe("buildPlanoDeEtiquetas", () => {
  it("reaproveita a etiqueta de mesmo nome do destino e cria só as que faltam", () => {
    const plano = buildPlanoDeEtiquetas(
      [
        { name: "Erro", color: "#f00" },
        { name: " Relatório ", color: "#0f0" },
        { name: "Urgente", color: "#00f" },
      ],
      [
        { id: "l1", name: "erro" },
        { id: "l2", name: "Relatório" },
      ]
    );
    expect(plano.existentes).toEqual(["l1", "l2"]);
    expect(plano.criar).toEqual([{ name: "Urgente", color: "#00f" }]);
  });

  it("não cria a mesma etiqueta duas vezes", () => {
    const plano = buildPlanoDeEtiquetas(
      [
        { name: "Nova", color: "#111" },
        { name: "nova", color: "#222" },
      ],
      []
    );
    expect(plano.criar).toEqual([{ name: "Nova", color: "#111" }]);
  });
});

describe("validação do pedido", () => {
  it("exige o sistema de destino, no campo project_id_destino", () => {
    expect(() => requireDestinoValido("origem", undefined)).toThrow(MENSAGENS_DE_ALTERAR_SISTEMA.destinoObrigatorio);
    try {
      requireDestinoValido("origem", "");
    } catch (erro) {
      expect(erro).toMatchObject({ status: 400, path: "project_id_destino" });
    }
  });

  it("recusa o próprio sistema como destino", () => {
    expect(() => requireDestinoValido("origem", "origem")).toThrow(MENSAGENS_DE_ALTERAR_SISTEMA.mesmoSistema);
  });

  it("devolve o destino quando é outro sistema", () => {
    expect(requireDestinoValido("origem", "destino")).toBe("destino");
  });

  it("recusa chamado que já foi movido", () => {
    expect(() => requireNaoMovido({ movedToIssueId: "novo" })).toThrow(MENSAGENS_DE_ALTERAR_SISTEMA.jaMovido);
    expect(() => requireNaoMovido({ movedToIssueId: null })).not.toThrow();
  });

  it("nenhuma mensagem leva travessão", () => {
    for (const mensagem of Object.values(MENSAGENS_DE_ALTERAR_SISTEMA)) expect(mensagem).not.toContain("—");
  });
});

describe("buildIdentificador", () => {
  it("junta o identificador do sistema e a sequência", () => {
    expect(buildIdentificador("SIART", 123)).toBe("SIART-123");
  });
});
