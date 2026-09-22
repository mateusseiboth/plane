/**
 * Importação do legado para a wiki: título de cada arquivo do disco virtual,
 * o HTML da página "Processos" (um bloco de anexo por arquivo) e o HTML de uma
 * página de FAQ por categoria. Funções puras, sem banco nem MySQL.
 */
import { describe, expect, it } from "bun:test";
import {
  buildFaqCategoriaHtml,
  buildProcessosHtml,
  buildRespostaHtml,
  findTituloDoArquivo,
  normalizeNomeDeArquivo,
} from "@utils/wiki-legado";

describe("normalizeNomeDeArquivo", () => {
  it("ignora caixa, acento, separadores e extensão", () => {
    expect(normalizeNomeDeArquivo("Diagrama de Atividade - Demandas - Cliente.jpg")).toBe(
      normalizeNomeDeArquivo("arquivos_disco/2020/06/Diagrama_de_Atividade___Demandas___Cliente.jpg")
    );
    expect(normalizeNomeDeArquivo("regras_versionamento.jpg")).toBe(normalizeNomeDeArquivo("Regras_Versionamento.JPG"));
  });
});

describe("findTituloDoArquivo", () => {
  const catalogo = new Map([
    [normalizeNomeDeArquivo("Regras_Versionamento.jpg"), "Regras de Versionamento dos Sitemas"],
  ]);

  it("usa o nome cadastrado no disco virtual quando o arquivo é conhecido", () => {
    expect(findTituloDoArquivo(catalogo, "regras_versionamento.jpg")).toBe("Regras de Versionamento dos Sitemas");
  });

  it("sem cadastro, deixa o nome do arquivo legível", () => {
    expect(findTituloDoArquivo(catalogo, "fluxo_trabalho_mensal.jpg")).toBe("Fluxo trabalho mensal");
  });
});

describe("buildProcessosHtml", () => {
  it("um título e um bloco de anexo por arquivo, na ordem dos títulos", () => {
    const html = buildProcessosHtml([
      { titulo: "Fluxo", assetId: "a2", nome: "fluxo.jpg", tamanho: 10, mimeType: "image/jpeg" },
      { titulo: "Diagrama <Cliente>", assetId: "a1", nome: "d.jpg", tamanho: 20, mimeType: "image/jpeg" },
    ]);
    expect(html.indexOf("Diagrama")).toBeLessThan(html.indexOf("Fluxo"));
    expect(html).toContain("<h3>Diagrama &lt;Cliente&gt;</h3>");
    expect(html).toContain(
      '<attachment-component src="a1" name="d.jpg" size="20" mimetype="image/jpeg"></attachment-component>'
    );
    expect(html.match(/<attachment-component/g)).toHaveLength(2);
  });
});

describe("buildRespostaHtml", () => {
  it("texto simples vira parágrafos, escapado", () => {
    expect(buildRespostaHtml("Linha 1\nLinha <2>\n\nOutro")).toBe("<p>Linha 1<br>Linha &lt;2&gt;</p><p>Outro</p>");
  });

  it("HTML do legado é mantido, sem script nem estilo", () => {
    expect(buildRespostaHtml('<b>ok</b><script>alert(1)</script><style>p{}</style><p onclick="x()">a</p>')).toBe(
      "<b>ok</b><p>a</p>"
    );
  });
});

describe("buildFaqCategoriaHtml", () => {
  it("subcategoria vira seção; pergunta, resposta, sistema e palavras-chave entram", () => {
    const html = buildFaqCategoriaHtml([
      {
        nome: "Folha",
        perguntas: [{ pergunta: "Como gerar?", resposta: "Assim.", sistema: "SIGAQ", tags: "folha, 13º" }],
      },
    ]);
    expect(html).toContain("<h2>Folha</h2>");
    expect(html).toContain("<h3>Como gerar?</h3>");
    expect(html).toContain("<p>Assim.</p>");
    expect(html).toContain("<p>Sistema: SIGAQ</p>");
    expect(html).toContain("<p>Palavras-chave: folha, 13º</p>");
  });
});
