/**
 * O bloco de anexo do editor sobrevive à conversão que o `live` faz entre HTML
 * e o documento Yjs. Sem o nó no esquema do servidor, o anexo sumiria da página
 * na primeira abertura (o `live` remonta o Yjs a partir do HTML gravado).
 */
import { describe, expect, it } from "vitest";
import { convertHTMLDocumentToAllFormats } from "@plane/editor/lib";

const ANEXO =
  '<attachment-component id="b1" src="asset-1" name="Manual de implantação.pdf" size="2048" mimetype="application/pdf"></attachment-component>';

describe("bloco de anexo na conversão HTML ↔ Yjs", () => {
  it("mantém arquivo, nome, tamanho e tipo", () => {
    const { description_html } = convertHTMLDocumentToAllFormats({
      document_html: `<p>Antes</p>${ANEXO}<p>Depois</p>`,
      variant: "document",
    });
    expect(description_html).toContain("<attachment-component");
    expect(description_html).toContain('src="asset-1"');
    expect(description_html).toContain('name="Manual de implantação.pdf"');
    expect(description_html).toContain('size="2048"');
    expect(description_html).toContain('mimetype="application/pdf"');
    expect(description_html.indexOf("Antes")).toBeLessThan(description_html.indexOf("attachment-component"));
  });
});
