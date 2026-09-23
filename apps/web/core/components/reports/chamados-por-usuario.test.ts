/**
 * Regras da tela "Chamados por usuário": a API manda só uma amostra por pessoa,
 * então a tela precisa saber quando sobrou chamado de fora e como paginar o resto.
 * Puro. Rodar com `bun test core/components/reports`.
 */
import { describe, expect, it } from "bun:test";
import {
  TAMANHO_DA_PAGINA,
  buildPaginacao,
  buildResumoDoUsuario,
  buildRotuloDaAmostra,
  buildRotuloVerTodos,
  isAmostraParcial,
  readTotalDoUsuario,
} from "@/components/reports/chamados-por-usuario";

const usuario = (total: number, naAmostra: number, abertos?: number, encerrados?: number) => ({
  user_id: "u1",
  name: "Davi Dev",
  total,
  chamados_total: total,
  abertos,
  encerrados,
  chamados: Array.from({ length: naAmostra }, (_, i) => ({ id: `c${i}` })),
});

describe("readTotalDoUsuario", () => {
  it("usa o total do filtro, não o tamanho da amostra", () => {
    expect(readTotalDoUsuario(usuario(4000, 25))).toBe(4000);
  });

  it("sem chamados_total, cai no total e depois na amostra", () => {
    expect(readTotalDoUsuario({ total: 7, chamados: [] })).toBe(7);
    expect(readTotalDoUsuario({ chamados: [{ id: "a" }, { id: "b" }] })).toBe(2);
  });
});

describe("isAmostraParcial", () => {
  it("só avisa quando ficou chamado de fora da amostra", () => {
    expect(isAmostraParcial(usuario(4000, 25))).toBe(true);
    expect(isAmostraParcial(usuario(25, 25))).toBe(false);
    expect(isAmostraParcial(usuario(0, 0))).toBe(false);
  });
});

describe("rótulos", () => {
  it("o botão diz quantos chamados vai abrir", () => {
    expect(buildRotuloVerTodos(usuario(4000, 25))).toBe("Ver todos os 4000 chamados");
  });

  it("a amostra diz o que está sendo mostrado", () => {
    expect(buildRotuloDaAmostra(usuario(4000, 25))).toBe("Mostrando os 25 chamados mais recentes de 4000.");
  });

  it("o resumo soma abertos e encerrados quando a API mandou", () => {
    expect(buildResumoDoUsuario(usuario(30, 25, 18, 12))).toBe("30 chamado(s) · 18 em aberto · 12 encerrado(s)");
    expect(buildResumoDoUsuario(usuario(30, 25))).toBe("30 chamado(s)");
  });

  it("nenhum texto da tela usa travessão", () => {
    const textos = [
      buildRotuloVerTodos(usuario(4000, 25)),
      buildRotuloDaAmostra(usuario(4000, 25)),
      buildResumoDoUsuario(usuario(30, 25, 18, 12)),
      buildPaginacao(4000, 2).rotulo,
    ];
    expect(textos.some((t) => t.includes("—"))).toBe(false);
  });
});

describe("buildPaginacao", () => {
  it("pagina de 50 em 50 por padrão", () => {
    expect(TAMANHO_DA_PAGINA).toBe(50);
    expect(buildPaginacao(120, 1)).toEqual({
      pagina: 1,
      totalPaginas: 3,
      temAnterior: false,
      temProxima: true,
      rotulo: "Página 1 de 3",
    });
    expect(buildPaginacao(120, 3)).toMatchObject({ temAnterior: true, temProxima: false });
  });

  it("uma página só quando não há nada ou cabe tudo", () => {
    expect(buildPaginacao(0, 1)).toMatchObject({ totalPaginas: 1, temAnterior: false, temProxima: false });
    expect(buildPaginacao(50, 1)).toMatchObject({ totalPaginas: 1, temProxima: false });
  });

  it("respeita outro tamanho de página", () => {
    expect(buildPaginacao(25, 2, 10)).toMatchObject({ totalPaginas: 3, temAnterior: true, temProxima: true });
  });
});
