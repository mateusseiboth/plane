/**
 * Pós-atendimento: regras puras da tela (payload do formulário, opções por
 * permissão, parâmetros da fila e do relatório, etapa de conclusão, link do item
 * e quando oferecer "Concluir e fazer pós-atendimento").
 * Rodar com `bun test core/components/pos-atendimento`.
 */
import { describe, expect, it } from "bun:test";
import {
  POS_FILTROS_INICIAIS,
  POS_FORM_VAZIO,
  buildPosFilaParams,
  buildPosPayload,
  buildSatisfacaoParams,
  findCompletedStateId,
  getAlvoLink,
  getMeioContatoOptions,
  isConcluirComPosVisivel,
} from "@/components/pos-atendimento/helpers";

describe("payload do formulário", () => {
  const form = { ...POS_FORM_VAZIO, expectativa: "4", classificacao: "3", meio_contato: "1", observacao: " ok " };

  it("chamado manda os códigos como número e não manda o problema resolvido", () => {
    expect(buildPosPayload({ ...form, problema_resolvido: "sim" }, "issue")).toEqual({
      expectativa: 4,
      classificacao: 3,
      meio_contato: 1,
      observacao: "ok",
    });
  });

  it("visita manda o problema resolvido", () => {
    expect(buildPosPayload({ ...form, problema_resolvido: "parcial" }, "visit")).toMatchObject({
      problema_resolvido: "parcial",
    });
  });

  it("campo vazio vai nulo para a API apontar o campo", () => {
    expect(buildPosPayload(POS_FORM_VAZIO, "issue")).toMatchObject({ expectativa: null, classificacao: null });
  });
});

describe("meios de contato", () => {
  it("comunicador interno só para quem verifica", () => {
    expect(getMeioContatoOptions(false).map((o) => o.value)).toEqual(["1", "2", "4", "5"]);
    expect(getMeioContatoOptions(true).map((o) => o.value)).toEqual(["1", "2", "4", "5", "6"]);
  });
});

describe("parâmetros", () => {
  it("fila leva a aba, a página e só os filtros preenchidos", () => {
    expect(
      buildPosFilaParams(
        { ...POS_FILTROS_INICIAIS, situacao: "to_verify", entity_id: "e1", desde: "2026-09-01" },
        2,
        25
      )
    ).toEqual({
      situacao: "to_verify",
      origem: "all",
      entity_id: "e1",
      desde: "2026-09-01",
      per_page: "25",
      cursor: "25:2:0",
    });
  });

  it("relatório ignora aba e responsável", () => {
    expect(
      buildSatisfacaoParams({ ...POS_FILTROS_INICIAIS, situacao: "verified", responsavel_id: "u1", project_id: "p1" })
    ).toEqual({ origem: "all", project_id: "p1" });
  });
});

describe("etapa de conclusão", () => {
  it("pega a primeira etapa concluída pela ordem", () => {
    expect(
      findCompletedStateId([
        { id: "b", group: "completed", sequence: 50 },
        { id: "a", group: "started", sequence: 10 },
        { id: "c", group: "completed", sequence: 40 },
      ])
    ).toBe("c");
    expect(findCompletedStateId([{ id: "a", group: "started", sequence: 1 }])).toBeNull();
  });
});

describe("link do item da fila", () => {
  it("chamado abre no sistema; visita abre na tela de visitas", () => {
    expect(getAlvoLink("ws", { origem: "issue", id: "i1", project_id: "p1" })).toBe("/ws/projects/p1/issues/i1");
    expect(getAlvoLink("ws", { origem: "visit", id: "v1", project_id: null })).toBe("/ws/visits/v1");
  });
});

describe("Concluir e fazer pós-atendimento", () => {
  it("aparece para quem registra, com o chamado ainda em andamento", () => {
    expect(isConcluirComPosVisivel({ stateGroup: "started", canRecord: true })).toBe(true);
    expect(isConcluirComPosVisivel({ stateGroup: "completed", canRecord: true })).toBe(false);
    expect(isConcluirComPosVisivel({ stateGroup: "cancelled", canRecord: true })).toBe(false);
    expect(isConcluirComPosVisivel({ stateGroup: "started", canRecord: false })).toBe(false);
  });
});
