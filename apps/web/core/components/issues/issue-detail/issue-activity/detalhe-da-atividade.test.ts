/**
 * Cada linha da atividade do chamado mostra quem fez, a data e hora absolutas
 * e, na mudança de etapa, de qual etapa para qual (pedido do cliente, 23/10/2026).
 * Rodar com `bun test core/components/issues/issue-detail/issue-activity`.
 */
import { describe, expect, it } from "bun:test";
import { buildMudancaDeEtapa, formatDataHoraDaAtividade, readNomeDoAutor } from "./detalhe-da-atividade";

describe("formatDataHoraDaAtividade", () => {
  it("mostra dd/mm/aaaa hh:mm no fuso do navegador", () => {
    const instante = new Date(2026, 9, 3, 9, 5).toISOString();
    expect(formatDataHoraDaAtividade(instante)).toBe("03/10/2026 09:05");
  });

  it("sem data, não mostra nada", () => {
    expect(formatDataHoraDaAtividade(undefined)).toBe("");
    expect(formatDataHoraDaAtividade("não é data")).toBe("");
  });
});

describe("buildMudancaDeEtapa", () => {
  it("mostra a etapa de origem e a de destino", () => {
    expect(buildMudancaDeEtapa({ old_value: "Triagem", new_value: "Em Análise" })).toBe("Triagem → Em Análise");
  });

  it("sem a etapa de origem gravada, mostra só o destino", () => {
    expect(buildMudancaDeEtapa({ old_value: null, new_value: "Em Análise" })).toBe("Em Análise");
    expect(buildMudancaDeEtapa({ old_value: "", new_value: "Em Análise" })).toBe("Em Análise");
  });
});

describe("readNomeDoAutor", () => {
  it("usa o nome completo", () => {
    expect(readNomeDoAutor({ first_name: "Ana", last_name: "Souza", display_name: "ana.souza" })).toBe("Ana Souza");
  });

  it("sem nome cadastrado, usa o nome de exibição", () => {
    expect(readNomeDoAutor({ first_name: "", last_name: "", display_name: "ana.souza" })).toBe("ana.souza");
  });

  it("sem autor (ação do sistema ou do portal), não inventa nome", () => {
    expect(readNomeDoAutor(undefined)).toBe("");
  });
});
