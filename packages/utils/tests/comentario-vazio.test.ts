/**
 * Comentário vazio: o banco anexado (`<banco-anexo>`, do "/banco") é conteúdo,
 * como imagem e menção. Sem isso o botão Comentário ficava desabilitado num
 * comentário que só tinha o banco.
 */
import { describe, expect, it } from "bun:test";
import { isCommentEmpty } from "../src/string";

describe("isCommentEmpty", () => {
  it("parágrafo vazio é vazio", () => {
    expect(isCommentEmpty("<p></p>")).toBe(true);
  });

  it("só o banco anexado não é vazio", () => {
    expect(isCommentEmpty('<banco-anexo data-envio="1"></banco-anexo><p></p>')).toBe(false);
  });

  it("texto continua não vazio", () => {
    expect(isCommentEmpty("<p>oi</p>")).toBe(false);
  });
});
