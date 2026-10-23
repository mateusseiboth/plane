/**
 * Sugestões da wiki da Quality ao abrir solicitação: como o texto livre do
 * problema vira consulta para a IA da Quality, como cada resultado vira
 * sugestão (endereço na wiki, sistema, trecho), a prioridade das páginas do
 * sistema escolhido, a pergunta para a IA e o corte da resposta.
 * Puro, sem banco e sem rede.
 */
import { describe, expect, it } from "bun:test";
import { readConfigDaIaDaQuality } from "@modules/wiki-sugestoes/clientes/ia-da-quality";
import {
  buildConsultaDaWiki,
  buildPerguntaDeResolucao,
  buildTrechoDoConteudo,
  buildUrlDaWiki,
  isPaginaDoSistema,
  LIMITE_DA_SUGESTAO,
  LIMITE_DE_TERMOS_DA_WIKI,
  LIMITE_DO_TRECHO,
  limitSugestao,
  mapSugestaoDaWiki,
  prioritizePaginasDoSistema,
  readPaginasDaBusca,
  readPedidoDeResolucao,
  readRespostaDaIa,
  readSistemaDoPath,
  type PaginaDaIaDaQuality,
} from "@modules/wiki-sugestoes/wiki-sugestoes.rules";

const WIKI = "https://wiki.qualitysistemas.inf.br";

const pagina = (extra: Partial<PaginaDaIaDaQuality> = {}): PaginaDaIaDaQuality => ({
  id: "1",
  title: "Página",
  path: "web/Pagina",
  tags: [],
  summary: "",
  ...extra,
});

describe("buildConsultaDaWiki", () => {
  it("tira as palavras vazias e junta os termos com OU", () => {
    expect(buildConsultaDaWiki("O cliente não consegue emitir a nota fiscal")).toBe("emitir or nota or fiscal");
  });

  it("mantém o acento: a busca da wiki da Quality distingue emissão de emissao", () => {
    expect(buildConsultaDaWiki("Emissão da Guia de recolhimento")).toBe("emissão or guia or recolhimento");
  });

  it("texto vazio, só espaço ou só palavras vazias não vira consulta", () => {
    expect(buildConsultaDaWiki("")).toBe("");
    expect(buildConsultaDaWiki("   ")).toBe("");
    expect(buildConsultaDaWiki("o de a que para com não está")).toBe("");
  });

  it("não repete termo, sem diferença de caixa nem de acento, e fica com a primeira grafia", () => {
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

describe("readPaginasDaBusca", () => {
  it("lê os resultados de /api/wiki/search, com id em texto", () => {
    const corpo = {
      success: true,
      results: [
        { id: 348, title: "Parâmetros do Simples", path: "siart/Config", tags: ["siart"], summary: "Resumo" },
        { id: "12", title: "Sem tags", path: "web/x" },
      ],
      total: 2,
    };
    expect(readPaginasDaBusca(corpo)).toEqual([
      { id: "348", title: "Parâmetros do Simples", path: "siart/Config", tags: ["siart"], summary: "Resumo" },
      { id: "12", title: "Sem tags", path: "web/x", tags: [], summary: "" },
    ]);
  });

  it("resposta fora da forma vira lista vazia", () => {
    expect(readPaginasDaBusca(null)).toEqual([]);
    expect(readPaginasDaBusca({ success: false, error: "x" })).toEqual([]);
    expect(readPaginasDaBusca({ results: "x" })).toEqual([]);
  });

  it("descarta o resultado sem id, título ou caminho", () => {
    expect(readPaginasDaBusca({ results: [{ id: 1, title: "", path: "a" }, { title: "b", path: "b" }, 3] })).toEqual(
      []
    );
  });
});

describe("buildUrlDaWiki", () => {
  it("é o endereço público da wiki seguido do caminho", () => {
    expect(buildUrlDaWiki(WIKI, "siart/ConfigParametros")).toBe(`${WIKI}/siart/ConfigParametros`);
  });

  it("codifica cada pedaço do caminho, mantendo as barras", () => {
    expect(buildUrlDaWiki(WIKI, "Planejar/Orçamento modalidade")).toBe(`${WIKI}/Planejar/Or%C3%A7amento%20modalidade`);
  });
});

describe("readSistemaDoPath", () => {
  it("é o primeiro pedaço do caminho", () => {
    expect(readSistemaDoPath("siart/ConfigParametros")).toBe("siart");
    expect(readSistemaDoPath("Planejar")).toBe("Planejar");
    expect(readSistemaDoPath("/web/SIART")).toBe("web");
  });
});

describe("isPaginaDoSistema", () => {
  const siart = { identifier: "SIART", name: "Sistema de Arrecadação" };

  it("o primeiro pedaço do caminho é o identificador, sem diferença de caixa", () => {
    expect(isPaginaDoSistema("siart/ConfigParametros", [], siart)).toBe(true);
  });

  it("o primeiro pedaço do caminho é o nome, sem diferença de acento nem de sublinhado", () => {
    expect(isPaginaDoSistema("Sistema_de_Arrecadacao/x", [], siart)).toBe(true);
  });

  it("uma das tags é o identificador ou o nome", () => {
    expect(isPaginaDoSistema("web/x", ["nota", "Siart"], siart)).toBe(true);
    expect(isPaginaDoSistema("web/x", ["sistema de arrecadação"], siart)).toBe(true);
  });

  it("o sistema só no meio do caminho ou dentro de uma palavra não conta", () => {
    expect(isPaginaDoSistema("web/SIART", ["siartweb"], siart)).toBe(false);
    expect(isPaginaDoSistema("Planejar/x", [], siart)).toBe(false);
  });

  it("sistema sem identificador nem nome não casa com nada", () => {
    expect(isPaginaDoSistema("x/y", [""], { identifier: "", name: "" })).toBe(false);
  });
});

describe("prioritizePaginasDoSistema", () => {
  const paginas = [
    pagina({ id: "1", path: "web/a" }),
    pagina({ id: "2", path: "siart/b" }),
    pagina({ id: "3", path: "Planejar/c" }),
    pagina({ id: "4", path: "web/d", tags: ["siart"] }),
  ];

  it("as páginas do sistema vêm primeiro, cada grupo na ordem da busca", () => {
    const ordem = prioritizePaginasDoSistema(paginas, { identifier: "SIART", name: "SIART" }).map((p) => p.id);
    expect(ordem).toEqual(["2", "4", "1", "3"]);
  });

  it("sem sistema escolhido, a ordem da busca fica", () => {
    expect(prioritizePaginasDoSistema(paginas, null).map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });
});

describe("buildTrechoDoConteudo", () => {
  it("tira o título repetido, as marcas e as entidades", () => {
    const html = "<h1>Número da nota</h1>\n<p>Ajustado o <strong>número</strong>&nbsp;da DPS &amp; da nota.</p>";
    expect(buildTrechoDoConteudo(html)).toBe("Ajustado o número da DPS & da nota.");
  });

  it("conteúdo longo é cortado no fim de uma palavra, com reticências", () => {
    const trecho = buildTrechoDoConteudo(`<p>${"palavra ".repeat(100)}</p>`);
    expect(trecho.length).toBeLessThanOrEqual(LIMITE_DO_TRECHO);
    expect(trecho.endsWith("palavra…")).toBe(true);
  });

  it("conteúdo vazio vira texto vazio", () => {
    expect(buildTrechoDoConteudo("")).toBe("");
    expect(buildTrechoDoConteudo("<figure><img src='x.png'></figure>")).toBe("");
  });
});

describe("mapSugestaoDaWiki", () => {
  it("devolve id, título, trecho do resumo, endereço na wiki e o sistema", () => {
    const resultado = mapSugestaoDaWiki(
      pagina({ id: "348", title: "Simples Nacional", path: "siart/Config", tags: ["siart"], summary: "Resumo" }),
      WIKI
    );
    expect(resultado).toEqual({
      id: "348",
      name: "Simples Nacional",
      trecho: "Resumo",
      url: `${WIKI}/siart/Config`,
      sistema: "siart",
    });
  });

  it("sem resumo, o trecho sai do conteúdo da página", () => {
    expect(mapSugestaoDaWiki(pagina({ tags: ["a"] }), WIKI, "<p>Abra Tributos.</p>").trecho).toBe("Abra Tributos.");
  });

  it("sem resumo nem conteúdo, o trecho são as tags", () => {
    expect(mapSugestaoDaWiki(pagina({ tags: ["nota", "fiscal"] }), WIKI).trecho).toBe("nota, fiscal");
  });
});

describe("limitSugestao", () => {
  it("texto curto volta sem espaços nas pontas", () => {
    expect(limitSugestao("  Reemita a guia pelo menu Tributos.  ")).toBe("Reemita a guia pelo menu Tributos.");
  });

  it("texto longo é cortado no fim de uma palavra, com reticências", () => {
    const cortado = limitSugestao("palavra ".repeat(200));
    expect(cortado.length).toBeLessThanOrEqual(LIMITE_DA_SUGESTAO);
    expect(cortado.endsWith("palavra…")).toBe(true);
  });
});

describe("readPedidoDeResolucao", () => {
  it("lê o texto e os ids das páginas, sem repetir, sem o que não é id e sem passar do limite", () => {
    const pedido = readPedidoDeResolucao({
      texto: "  Guia não emite  ",
      paginas: ["1", 2, "1", "", "../admin", "abc", "3", "4", "5", "6"],
    });
    expect(pedido).toEqual({ texto: "Guia não emite", paginaIds: ["1", "2", "3", "4", "5"] });
  });

  it("corpo ausente ou fora da forma vira pedido vazio", () => {
    expect(readPedidoDeResolucao(undefined)).toEqual({ texto: "", paginaIds: [] });
    expect(readPedidoDeResolucao({ texto: 10, paginas: "a" })).toEqual({ texto: "", paginaIds: [] });
  });
});

describe("buildPerguntaDeResolucao", () => {
  it("pede o que fazer para resolver o problema, em português, com o relato", () => {
    const pergunta = buildPerguntaDeResolucao("A guia não emite", []);
    expect(pergunta).toContain("A guia não emite");
    expect(pergunta).toContain("resolver");
    expect(pergunta).not.toContain("Páginas da wiki");
  });

  it("cita os títulos das páginas quando vierem", () => {
    const pergunta = buildPerguntaDeResolucao("A guia não emite", ["Emissão de guia", "Boleto"]);
    expect(pergunta).toContain("Emissão de guia; Boleto");
  });
});

const resposta = (extra: Record<string, unknown> = {}) => ({
  query: "pergunta",
  response: "Reemita a guia pelo menu Tributos.",
  source_info: {
    source: "Knowledge Base",
    pages_consulted: [
      { id: "siart/guia", title: "Emissão de guia", path: "siart/guia" },
      { id: "siart/guia", title: "Emissão de guia", path: "siart/guia" },
      { id: "web/boleto", title: "Boleto", path: "web/boleto" },
    ],
  },
  ...extra,
});

describe("readRespostaDaIa", () => {
  it("devolve a sugestão e as páginas consultadas, sem repetir, com o endereço na wiki", () => {
    expect(readRespostaDaIa(resposta(), WIKI)).toEqual({
      sugestao: "Reemita a guia pelo menu Tributos.",
      paginas_consultadas: [
        { name: "Emissão de guia", url: `${WIKI}/siart/guia` },
        { name: "Boleto", url: `${WIKI}/web/boleto` },
      ],
    });
  });

  it("resposta longa chega cortada no tamanho do aviso", () => {
    const lida = readRespostaDaIa(resposta({ response: "Faça assim. ".repeat(120) }), WIKI);
    expect(lida?.sugestao.length).toBeLessThanOrEqual(LIMITE_DA_SUGESTAO);
    expect(lida?.sugestao.endsWith("…")).toBe(true);
  });

  it("sem páginas consultadas, a lista vem vazia", () => {
    expect(readRespostaDaIa({ response: "Faça assim." }, WIKI)).toEqual({
      sugestao: "Faça assim.",
      paginas_consultadas: [],
    });
  });

  it("o erro que a IA devolve com status 200 não vira sugestão", () => {
    const erro = { response: "Desculpe, ocorreu um erro ao processar", source_info: { source: "Error" } };
    expect(readRespostaDaIa(erro, WIKI)).toBeNull();
  });

  it("resposta vazia ou fora da forma não vira sugestão", () => {
    expect(readRespostaDaIa(null, WIKI)).toBeNull();
    expect(readRespostaDaIa({ response: "   " }, WIKI)).toBeNull();
    expect(readRespostaDaIa({ error: "Erro na consulta à IA" }, WIKI)).toBeNull();
  });
});

describe("readConfigDaIaDaQuality", () => {
  it("sem variável, aponta para a IA e a wiki da Quality em produção", () => {
    expect(readConfigDaIaDaQuality({})).toMatchObject({
      urlDaIa: "https://ia.qualitysistemas.inf.br",
      urlDaWiki: "https://wiki.qualitysistemas.inf.br",
      tempoLimiteMs: 6000,
    });
  });

  it("lê os endereços do ambiente, sem a barra final", () => {
    const config = readConfigDaIaDaQuality({
      IA_DA_QUALITY_URL: "http://localhost:9999/",
      WIKI_DA_QUALITY_URL: " http://wiki.local// ",
    });
    expect(config).toMatchObject({ urlDaIa: "http://localhost:9999", urlDaWiki: "http://wiki.local" });
  });
});
