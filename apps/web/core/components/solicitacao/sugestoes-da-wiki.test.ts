/**
 * O bloco "Na wiki" do modal de solicitação: o texto que vai para a busca
 * (título + complemento sem HTML) e quando vale buscar.
 */
import { describe, expect, it } from "bun:test";
import {
  buildTextoDaBuscaNaWiki,
  extractTextoDoHtml,
  isHoraDeBuscarNaWiki,
  MENSAGEM_SEM_IA,
  readFontesDaSugestao,
  readMensagemDaSugestao,
} from "@/components/solicitacao/sugestoes-da-wiki";

describe("extractTextoDoHtml", () => {
  it("tira as marcas e junta os blocos com espaço", () => {
    expect(extractTextoDoHtml("<p>Guia não</p><p><strong>emite</strong> no SIA</p>")).toBe("Guia não emite no SIA");
  });

  it("troca as entidades mais comuns pelo caractere", () => {
    expect(extractTextoDoHtml("<p>Tributos&nbsp;&amp; Taxas &lt;2026&gt; &quot;ok&quot; &#39;x&#39;</p>")).toBe(
      "Tributos & Taxas <2026> \"ok\" 'x'"
    );
  });

  it("editor vazio vira texto vazio", () => {
    expect(extractTextoDoHtml("<p></p>")).toBe("");
    expect(extractTextoDoHtml("")).toBe("");
  });
});

describe("buildTextoDaBuscaNaWiki", () => {
  it("junta o título e o complemento sem HTML", () => {
    expect(buildTextoDaBuscaNaWiki("  Nota fiscal ", "<p>não sai no</p><p>SIA</p>")).toBe("Nota fiscal não sai no SIA");
  });

  it("só o título, quando o complemento está vazio", () => {
    expect(buildTextoDaBuscaNaWiki("Nota fiscal rejeitada", "<p></p>")).toBe("Nota fiscal rejeitada");
  });
});

describe("isHoraDeBuscarNaWiki", () => {
  it("busca a partir de três palavras", () => {
    expect(isHoraDeBuscarNaWiki("nota fiscal rejeitada")).toBe(true);
  });

  it("com menos de três palavras não busca", () => {
    expect(isHoraDeBuscarNaWiki("nota fiscal")).toBe(false);
    expect(isHoraDeBuscarNaWiki("")).toBe(false);
  });

  it("pontuação e espaço não contam como palavra", () => {
    expect(isHoraDeBuscarNaWiki("nota  , - fiscal ...")).toBe(false);
  });
});

const FONTE = { name: "Emissão de guia", url: "https://wiki.qualitysistemas.inf.br/siart/guia" };

describe("readMensagemDaSugestao", () => {
  it("devolve a sugestão quando houve", () => {
    expect(readMensagemDaSugestao({ sugestao: "Reemita a guia.", paginas_consultadas: [] })).toBe("Reemita a guia.");
  });

  it("devolve o motivo quando não houve", () => {
    expect(readMensagemDaSugestao({ sugestao: null, motivo: MENSAGEM_SEM_IA })).toBe(MENSAGEM_SEM_IA);
  });

  it("sem resposta, avisa que a IA da Quality não respondeu", () => {
    expect(readMensagemDaSugestao(undefined)).toBe(MENSAGEM_SEM_IA);
    expect(MENSAGEM_SEM_IA).not.toContain("—");
  });
});

describe("readFontesDaSugestao", () => {
  it("devolve as páginas que a IA consultou", () => {
    expect(readFontesDaSugestao({ sugestao: "Reemita a guia.", paginas_consultadas: [FONTE] })).toEqual([FONTE]);
  });

  it("sem sugestão, não há fonte", () => {
    expect(readFontesDaSugestao({ sugestao: null, motivo: MENSAGEM_SEM_IA })).toEqual([]);
    expect(readFontesDaSugestao(undefined)).toEqual([]);
  });
});
