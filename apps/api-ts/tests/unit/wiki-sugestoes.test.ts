/**
 * Sugestões da wiki ao abrir solicitação: como o texto livre do problema vira
 * consulta, o endereço de cada página achada e o corte da sugestão da IA.
 * Puro, sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  buildConsultaDaWiki,
  buildEnderecoDaPagina,
  LIMITE_DA_SUGESTAO,
  LIMITE_DE_TERMOS_DA_WIKI,
  limitSugestao,
  readPedidoDeResolucao,
} from "@modules/wiki-sugestoes/wiki-sugestoes.rules";

describe("buildConsultaDaWiki", () => {
  it("tira as palavras vazias e junta os termos com OU", () => {
    expect(buildConsultaDaWiki("O cliente não consegue emitir a nota fiscal")).toBe("emitir or nota or fiscal");
  });

  it("texto vazio, só espaço ou só palavras vazias não vira consulta", () => {
    expect(buildConsultaDaWiki("")).toBe("");
    expect(buildConsultaDaWiki("   ")).toBe("");
    expect(buildConsultaDaWiki("o de a que para com")).toBe("");
  });

  it("não repete termo, sem diferença de caixa nem de acento", () => {
    expect(buildConsultaDaWiki("Nota nota NOTA guia Guía")).toBe("nota or guia");
  });

  it("pontuação e operadores digitados não entram na consulta", () => {
    expect(buildConsultaDaWiki('"boleto" -vencido OR (remessa) and; <p>banco</p>')).toBe(
      "boleto or vencido or remessa or banco"
    );
  });

  it("mantém números com três dígitos ou mais, como código de erro", () => {
    expect(buildConsultaDaWiki("erro 500 ao gerar a guia 12")).toBe("erro or 500 or gerar or guia");
  });

  it("limita a quantidade de termos, na ordem em que foram escritos", () => {
    const texto = "alfa bravo charlie delta echo foxtrot golf hotel india juliett kilo";
    const termos = buildConsultaDaWiki(texto).split(" or ");
    expect(termos).toHaveLength(LIMITE_DE_TERMOS_DA_WIKI);
    expect(termos[0]).toBe("alfa");
  });
});

describe("buildEnderecoDaPagina", () => {
  it("página sem sistema abre na wiki", () => {
    expect(buildEnderecoDaPagina({ slug: "quality", pageId: "pg1", projectIds: [], projectIdPreferido: "p1" })).toEqual(
      {
        project_id: null,
        url: "/quality/wiki/pg1",
      }
    );
  });

  it("página do sistema escolhido abre nele", () => {
    expect(
      buildEnderecoDaPagina({ slug: "quality", pageId: "pg1", projectIds: ["p2", "p1"], projectIdPreferido: "p1" })
    ).toEqual({ project_id: "p1", url: "/quality/projects/p1/pages/pg1" });
  });

  it("página de outro sistema abre no primeiro sistema dela", () => {
    expect(
      buildEnderecoDaPagina({ slug: "quality", pageId: "pg1", projectIds: ["p2", "p3"], projectIdPreferido: null })
    ).toEqual({ project_id: "p2", url: "/quality/projects/p2/pages/pg1" });
  });
});

describe("limitSugestao", () => {
  it("texto curto volta sem espaços nas pontas", () => {
    expect(limitSugestao("  Reemita a guia pelo menu Tributos.  ")).toBe("Reemita a guia pelo menu Tributos.");
  });

  it("texto longo é cortado no fim de uma palavra, com reticências", () => {
    const longo = "palavra ".repeat(200);
    const cortado = limitSugestao(longo);
    expect(cortado.length).toBeLessThanOrEqual(LIMITE_DA_SUGESTAO);
    expect(cortado.endsWith("palavra…")).toBe(true);
  });
});

const id = (n: number) => `0190f0e0-0000-7000-8000-00000000000${n}`;

describe("readPedidoDeResolucao", () => {
  it("lê o texto e as páginas, sem repetir, sem o que não é id e sem passar do limite", () => {
    const pedido = readPedidoDeResolucao({
      texto: "  Guia não emite  ",
      paginas: [id(1), id(2), id(1), 3, "", "nao-e-id", id(3), id(4), id(5), id(6)],
    });
    expect(pedido).toEqual({ texto: "Guia não emite", paginaIds: [id(1), id(2), id(3), id(4), id(5)] });
  });

  it("corpo ausente ou fora da forma vira pedido vazio", () => {
    expect(readPedidoDeResolucao(undefined)).toEqual({ texto: "", paginaIds: [] });
    expect(readPedidoDeResolucao({ texto: 10, paginas: "a" })).toEqual({ texto: "", paginaIds: [] });
  });
});
