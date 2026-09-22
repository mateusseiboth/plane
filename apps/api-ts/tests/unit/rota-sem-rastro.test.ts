/**
 * Rotas que não podem deixar rastro de quem chamou (a denúncia anônima). O
 * middleware de autenticação usa isto para não gravar o "último uso" da chave
 * de API, que é um instante preciso ao lado do usuário. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { isRotaSemRastro } from "@utils/rota-sem-rastro";

describe("isRotaSemRastro", () => {
  it("registrar denúncia não deixa rastro", () => {
    expect(isRotaSemRastro("POST", "/api/v1/workspaces/quality/denuncias/")).toBe(true);
    expect(isRotaSemRastro("POST", "/api/v1/workspaces/quality/denuncias")).toBe(true);
  });

  it("ler a lista e qualquer outra rota seguem normais", () => {
    expect(isRotaSemRastro("GET", "/api/v1/workspaces/quality/denuncias/")).toBe(false);
    expect(isRotaSemRastro("POST", "/api/v1/workspaces/quality/mural/")).toBe(false);
    expect(isRotaSemRastro("POST", "/api/v1/workspaces/quality/denuncias/x/")).toBe(false);
  });
});
