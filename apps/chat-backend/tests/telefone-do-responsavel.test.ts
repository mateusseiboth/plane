/**
 * Normalização do telefone usada para casar o WhatsApp com o Responsável.
 *
 * É aqui que mora a diferença entre "achou o cadastro" e "o bot perguntou o
 * nome de novo para quem é cliente há dez anos": o WhatsApp entrega
 * 55 DD 9XXXXXXXX e o cadastro herdado do SAC guardou, muitas vezes, o mesmo
 * número sem o nono dígito.
 */
import { describe, expect, it } from "bun:test";
import { somenteDigitos, telefoneComDdi, variantesDeTelefone } from "@/responsaveis";

describe("telefoneComDdi", () => {
  it("prefixa 55 no formato brasileiro sem DDI", () => {
    expect(telefoneComDdi("(67) 99999-0000")).toBe("5567999990000");
    expect(telefoneComDdi("6733210000")).toBe("556733210000");
  });

  it("mantém o número que já veio com DDI", () => {
    expect(telefoneComDdi("5567999990000")).toBe("5567999990000");
  });

  it("devolve vazio quando não há dígito nenhum", () => {
    expect(telefoneComDdi("sem telefone")).toBe("");
    expect(somenteDigitos(null)).toBe("");
  });
});

describe("variantesDeTelefone", () => {
  it("procura o mesmo celular com e sem o nono dígito", () => {
    const variantes = variantesDeTelefone("5567999990000");
    expect(variantes).toContain("5567999990000");
    expect(variantes).toContain("556799990000");
    expect(variantes).toContain("67999990000");
  });

  it("procura o fixo/antigo também na forma com nono dígito", () => {
    const variantes = variantesDeTelefone("556733210000");
    expect(variantes).toContain("556733210000");
    expect(variantes).toContain("5567933210000");
  });

  it("não procura nada quando o número é curto demais para ser telefone", () => {
    expect(variantesDeTelefone("123")).toEqual([]);
    expect(variantesDeTelefone(undefined)).toEqual([]);
  });
});
