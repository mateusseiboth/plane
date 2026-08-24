/**
 * O texto rico que chega do portal.
 *
 * Quem digita ali é gente de fora, sem conta no Plane, e o que ela escreve vai
 * parar na descrição do chamado — que a equipe abre no editor do produto. Por
 * isso o texto é limpo no servidor: o que não está na lista de permissão não
 * entra, e nenhuma decisão de segurança fica com o navegador do cliente.
 */
import { describe, expect, it } from "bun:test";
import { limparTextoDoCliente, textoSemMarcacao } from "@modules/portal/texto-rico";

describe("limparTextoDoCliente", () => {
  it("mantém a formatação que o cliente usa de verdade", () => {
    const html = limparTextoDoCliente(
      "<p>Isto é <strong>urgente</strong> e <em>trava</em> tudo.</p><ul><li>Um</li><li>Dois</li></ul>"
    );
    expect(html).toBe("<p>Isto é <strong>urgente</strong> e <em>trava</em> tudo.</p><ul><li>Um</li><li>Dois</li></ul>");
  });

  it("normaliza o que o navegador produz: div vira parágrafo, b vira strong", () => {
    expect(limparTextoDoCliente("<div>Linha</div>")).toBe("<p>Linha</p>");
    expect(limparTextoDoCliente("<p><b>Forte</b> e <i>torto</i></p>")).toBe(
      "<p><strong>Forte</strong> e <em>torto</em></p>"
    );
  });

  it("apaga script e o conteúdo dele", () => {
    expect(limparTextoDoCliente("<p>Antes</p><script>alert(1)</script><p>Depois</p>")).toBe(
      "<p>Antes</p><p>Depois</p>"
    );
    expect(limparTextoDoCliente("<style>body{display:none}</style><p>Oi</p>")).toBe("<p>Oi</p>");
  });

  it("apaga qualquer atributo, inclusive os de evento", () => {
    expect(limparTextoDoCliente('<p onclick="roubar()" style="color:red">Oi</p>')).toBe("<p>Oi</p>");
  });

  it("guarda só link http, https e mailto", () => {
    expect(limparTextoDoCliente('<a href="https://gov.br">gov</a>')).toContain('href="https://gov.br"');
    expect(limparTextoDoCliente('<a href="mailto:a@b.com">e-mail</a>')).toContain('href="mailto:a@b.com"');
    // Endereço recusado: some o link, fica o texto.
    expect(limparTextoDoCliente('<a href="javascript:alert(1)">clique</a>')).toBe("<p>clique</p>");
    expect(limparTextoDoCliente('<a href="data:text/html,<script>">clique</a>')).toBe("<p>clique</p>");
  });

  it("abre link em outra aba sem entregar a página de origem", () => {
    const html = limparTextoDoCliente('<a href="https://gov.br">gov</a>');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it("tira imagem e vídeo embutidos — mídia entra como anexo", () => {
    expect(limparTextoDoCliente('<p>Veja <img src="http://x/y.png" /> aqui</p>')).toBe("<p>Veja  aqui</p>");
    expect(limparTextoDoCliente('<iframe src="http://x"></iframe><p>Oi</p>')).toBe("<p>Oi</p>");
  });

  it("mantém o texto de tags desconhecidas", () => {
    expect(limparTextoDoCliente("<p><span>Texto</span> <font>colorido</font></p>")).toBe("<p>Texto colorido</p>");
    // Sem bloco nenhum sobrando, o texto ganha um parágrafo — é o que o editor
    // do produto espera receber.
    expect(limparTextoDoCliente("<table><tr><td>Célula</td></tr></table>")).toBe("<p>Célula</p>");
  });

  it("fecha o que o cliente deixou aberto", () => {
    expect(limparTextoDoCliente("<p><strong>Sem fim")).toBe("<p><strong>Sem fim</strong></p>");
  });

  it("escapa o que não é marcação", () => {
    expect(limparTextoDoCliente("<p>1 &lt; 2 &amp; 3 > 0</p>")).toBe("<p>1 &lt; 2 &amp; 3 &gt; 0</p>");
    expect(limparTextoDoCliente("<p>Tom & Jerry</p>")).toBe("<p>Tom &amp; Jerry</p>");
  });

  it("aceita texto puro, sem marcação nenhuma", () => {
    expect(limparTextoDoCliente("Não consigo entrar no sistema")).toBe("<p>Não consigo entrar no sistema</p>");
  });

  it("devolve parágrafo vazio quando não sobra nada", () => {
    expect(limparTextoDoCliente("")).toBe("<p></p>");
    expect(limparTextoDoCliente("<script>alert(1)</script>")).toBe("<p></p>");
    expect(limparTextoDoCliente("   ")).toBe("<p></p>");
  });

  it("corta texto absurdamente longo em vez de guardar tudo", () => {
    const enorme = limparTextoDoCliente("<p>" + "a".repeat(50_000) + "</p>");
    expect(enorme.length).toBeLessThan(21_000);
    expect(enorme).toEndWith("</p>");
  });
});

describe("textoSemMarcacao", () => {
  it("devolve o texto legível, para a busca do produto", () => {
    expect(textoSemMarcacao("<p>Isto é <strong>urgente</strong></p><ul><li>Um</li></ul>")).toBe("Isto é urgente Um");
  });

  it("traz de volta as entidades que estavam escapadas", () => {
    expect(textoSemMarcacao("<p>Tom &amp; Jerry &lt;3</p>")).toBe("Tom & Jerry <3");
  });
});
