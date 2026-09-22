/**
 * Validação das listas de ações que chegam à API de funções (permissões de uma
 * função e exceções por pessoa). Cada erro volta com o `path` do campo, para a
 * tela marcar a linha certa. Função pura, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { findActionErrors } from "@modules/roles/validar-acoes";

const TODAS = ["issue.view", "issue.priority", "role.manage"];

describe("findActionErrors", () => {
  it("lista válida não gera erro", () => {
    expect(findActionErrors({ granted: ["issue.view"] }, TODAS)).toEqual([]);
  });

  it("campo que não é lista vira erro no próprio campo", () => {
    expect(findActionErrors({ granted: "issue.view" }, TODAS)).toEqual([
      { path: "granted", message: "Informe uma lista de permissões." },
    ]);
  });

  it("ação fora do catálogo aponta a posição", () => {
    expect(findActionErrors({ granted: ["issue.view", "nao.existe"] }, TODAS)).toEqual([
      { path: "granted[1]", message: "Permissão desconhecida." },
    ]);
  });

  it("não concede o que quem pede não tem", () => {
    expect(findActionErrors({ granted: ["role.manage"] }, ["issue.view"])).toEqual([
      { path: "granted[0]", message: "Você não pode conceder uma permissão que não tem." },
    ]);
  });

  it("negar não exige ter a permissão", () => {
    expect(findActionErrors({ revoked: ["role.manage"] }, ["issue.view"], { grantFields: ["granted"] })).toEqual([]);
  });

  it("campo ausente é ignorado", () => {
    expect(findActionErrors({}, TODAS)).toEqual([]);
  });
});
