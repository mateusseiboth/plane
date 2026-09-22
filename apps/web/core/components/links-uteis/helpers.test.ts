/**
 * Montagem do endereço dos Links úteis: o link copiado tem de abrir fora daqui,
 * então ele nasce da origem em que a tela está aberta, nunca de endereço fixo.
 */
import { describe, expect, it } from "bun:test";
import { buildEndereco, readCaminhoDoCartao, readValorInicial } from "./helpers";
import type { TCartaoDeLink } from "@/services/links-uteis.service";

const cartaoBase = {
  chave: "portal",
  titulo: "Portal do cliente",
  descricao: "Onde o cliente abre a solicitação.",
  quemUsa: "Cliente com conta do portal.",
};

const pronto: TCartaoDeLink = { ...cartaoBase, caminho: "/portal?workspace=quality", campo: null, aviso: null };

const comCampo: TCartaoDeLink = {
  ...cartaoBase,
  chave: "transcricao",
  caminho: "",
  campo: { rotulo: "Protocolo", exemplo: "20260922-0007", prefixo: "/quality/chat-view/", sufixo: "", opcoes: [] },
  aviso: null,
};

const comOpcoes: TCartaoDeLink = {
  ...comCampo,
  campo: {
    rotulo: "Sistema",
    exemplo: "SIART",
    prefixo: "/chat-api/client?workspace=quality&system=",
    sufixo: "",
    opcoes: [
      { valor: "SIART", rotulo: "SIART" },
      { valor: "ALMOXA", rotulo: "Almoxarifado" },
    ],
  },
};

describe("readCaminhoDoCartao", () => {
  it("cartão sem campo já vem com o caminho pronto", () => {
    expect(readCaminhoDoCartao(pronto, "")).toBe("/portal?workspace=quality");
  });

  it("cartão com campo monta o caminho com o valor escolhido", () => {
    expect(readCaminhoDoCartao(comCampo, "20260922-0007")).toBe("/quality/chat-view/20260922-0007");
  });

  it("valor com caractere especial é escapado, senão o link quebra", () => {
    expect(readCaminhoDoCartao(comOpcoes, "SIS TEMA&x")).toBe(
      "/chat-api/client?workspace=quality&system=SIS%20TEMA%26x"
    );
  });

  it("sem valor não há caminho: nada de link pela metade", () => {
    expect(readCaminhoDoCartao(comCampo, "   ")).toBe("");
  });
});

describe("buildEndereco", () => {
  it("junta a origem da tela com o caminho", () => {
    expect(buildEndereco("https://plane.qualitysistemas.inf.br", "/portal?workspace=quality")).toBe(
      "https://plane.qualitysistemas.inf.br/portal?workspace=quality"
    );
  });

  it("origem com barra no fim não vira barra dobrada", () => {
    expect(buildEndereco("http://10.1.2.12/", "/god-mode/")).toBe("http://10.1.2.12/god-mode/");
  });

  it("sem caminho não há endereço para copiar", () => {
    expect(buildEndereco("https://exemplo.com", "")).toBe("");
  });
});

describe("readValorInicial", () => {
  it("campo com lista já começa na primeira opção", () => {
    expect(readValorInicial(comOpcoes)).toBe("SIART");
  });

  it("campo livre começa vazio", () => {
    expect(readValorInicial(comCampo)).toBe("");
  });

  it("cartão sem campo não tem valor", () => {
    expect(readValorInicial(pronto)).toBe("");
  });
});
