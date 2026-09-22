/**
 * Ouvidoria, denúncia, currículos e lista de e-mails: regras puras das telas
 * (consultas, lista para copiar, passo "ação" do fluxo do robô).
 * Rodar com `bun test core/components/ouvidoria`.
 */
import { describe, expect, it } from "bun:test";
import {
  ACOES,
  buildContatoEmailQuery,
  buildCurriculoQuery,
  buildOuvidoriaQuery,
  buildPaginaCursor,
  formatDia,
  formatEmailsParaCopiar,
  isOuvidoriaEvent,
  updatePassoDeAcao,
} from "./helpers";

describe("ações da matriz", () => {
  it("as chaves são as do catálogo do api-ts", () => {
    expect(ACOES).toEqual({
      OUVIDORIA_READ: "ouvidoria.read",
      DENUNCIA_READ: "denuncia.read",
      CURRICULO_READ: "curriculo.read",
      CONTATO_EXPORT: "contato.export",
    });
  });
});

describe("consultas", () => {
  it("ouvidoria: tipo e lida só quando escolhidos", () => {
    expect(buildOuvidoriaQuery({ kind: "", read: "", cursor: undefined })).toBe("");
    expect(buildOuvidoriaQuery({ kind: "sugestao", read: "false", cursor: "20:1:0" })).toBe(
      "?kind=sugestao&read=false&cursor=20%3A1%3A0"
    );
  });

  it("currículos: vaga, lido e entrevistado", () => {
    expect(buildCurriculoQuery({ position: " prog ", read: "true", interviewed: "", cursor: undefined })).toBe(
      "?position=prog&read=true"
    );
  });

  it("lista de e-mails: sistemas separados por vírgula e internos só quando marcado", () => {
    expect(
      buildContatoEmailQuery({ entityId: "e1", entityType: "", projectIds: ["p1", "p2"], isWithMembers: true })
    ).toBe("?entity_id=e1&project_ids=p1%2Cp2&include_members=true");
    expect(buildContatoEmailQuery({ entityId: "", entityType: "0", projectIds: [], isWithMembers: false })).toBe(
      "?entity_type=0"
    );
  });

  it("cursor da página no formato da API", () => {
    expect(buildPaginaCursor(20, 0)).toBeUndefined();
    expect(buildPaginaCursor(20, 2)).toBe("20:2:0");
  });
});

describe("formatEmailsParaCopiar", () => {
  it("separa por ponto e vírgula, que é o que o Outlook e o Gmail aceitam no CCO", () => {
    expect(formatEmailsParaCopiar(["a@b.com", "c@d.com"])).toBe("a@b.com; c@d.com");
    expect(formatEmailsParaCopiar([])).toBe("");
  });
});

describe("formatDia", () => {
  it("mostra o dia da denúncia sem converter fuso (não pode voltar um dia)", () => {
    expect(formatDia("2026-09-22")).toBe("22/09/2026");
  });
});

describe("isOuvidoriaEvent", () => {
  it("só os eventos da ouvidoria atualizam o contador", () => {
    expect(isOuvidoriaEvent({ entity: "ouvidoria" })).toBe(true);
    expect(isOuvidoriaEvent({ entity: "mural" })).toBe(false);
  });
});

describe("updatePassoDeAcao", () => {
  const passo = { type: "action", destino: "ouvidoria", params: { tipo: "sugestao" }, prompts: { cnpj: "CNPJ?" } };

  it("trocar o destino limpa parâmetros e perguntas do destino anterior", () => {
    expect(updatePassoDeAcao(passo, { destino: "curriculo" })).toEqual({
      type: "action",
      destino: "curriculo",
      params: {},
      prompts: {},
    });
  });

  it("parâmetro e pergunta entram sem apagar os outros; pergunta vazia volta ao padrão", () => {
    expect(updatePassoDeAcao(passo, { param: ["tipo", "reclamacao"] }).params).toEqual({ tipo: "reclamacao" });
    expect(updatePassoDeAcao(passo, { prompt: ["mensagem", "Conte"] }).prompts).toEqual({
      cnpj: "CNPJ?",
      mensagem: "Conte",
    });
    expect(updatePassoDeAcao(passo, { prompt: ["cnpj", ""] }).prompts).toEqual({});
  });
});
