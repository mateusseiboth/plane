/**
 * Chave de API de painel de TV: geração, hash, escopo, leitura do cabeçalho e
 * validação do formulário. Tudo puro — sem banco.
 */
import { describe, expect, it } from "bun:test";
import {
  ESCOPO_TODOS,
  PAINEIS_DA_CHAVE,
  PREFIXO_DA_CHAVE,
  generateChave,
  hashChave,
  isEscopoLiberado,
  isPainelDaChave,
  parseChaveInput,
  readChaveDaRequisicao,
  readUltimos4,
} from "@modules/painel-tv/chaves/chave";

describe("chave de painel", () => {
  it("gera com prefixo, tamanho suficiente e valores diferentes a cada chamada", () => {
    const primeira = generateChave();
    const segunda = generateChave();
    expect(primeira.startsWith(PREFIXO_DA_CHAVE)).toBe(true);
    expect(primeira.length).toBeGreaterThanOrEqual(40);
    expect(primeira).not.toBe(segunda);
    expect(primeira).toMatch(/^ptv_[A-Za-z0-9_-]+$/);
  });

  it("o hash é SHA-256 em hexadecimal, estável e diferente para chaves diferentes", () => {
    const chave = generateChave();
    expect(hashChave(chave)).toHaveLength(64);
    expect(hashChave(chave)).toBe(hashChave(chave));
    expect(hashChave(chave)).not.toBe(hashChave(generateChave()));
  });

  it("espaço em volta não muda o hash (a TV cola a chave da URL)", () => {
    const chave = generateChave();
    expect(hashChave(` ${chave}\n`)).toBe(hashChave(chave));
  });

  it("guarda só os quatro últimos caracteres para a tela reconhecer a chave", () => {
    expect(readUltimos4("ptv_abcdefgh1234")).toBe("1234");
  });

  it("conhece os cinco painéis", () => {
    expect([...PAINEIS_DA_CHAVE]).toEqual(["ti", "qualidade", "atendimento", "mapa", "backups"]);
    expect(isPainelDaChave("mapa")).toBe(true);
    expect(isPainelDaChave("financeiro")).toBe(false);
  });

  it("o escopo libera só os painéis gravados na chave", () => {
    expect(isEscopoLiberado(["ti", "mapa"], "ti")).toBe(true);
    expect(isEscopoLiberado(["ti", "mapa"], "qualidade")).toBe(false);
    expect(isEscopoLiberado([], "ti")).toBe(false);
  });

  it("a chave geral abre todos os painéis", () => {
    for (const painel of PAINEIS_DA_CHAVE) expect(isEscopoLiberado([ESCOPO_TODOS], painel)).toBe(true);
  });

  it("escolher 'todos os painéis' descarta os escopos restritos", () => {
    expect(parseChaveInput({ name: "Recepção", scopes: ["todos", "mapa"] }).data.scopes).toEqual(["todos"]);
  });

  it("lê a chave do cabeçalho e, na falta dele, da URL", () => {
    expect(readChaveDaRequisicao({ "x-panel-key": "ptv_a" }, {})).toBe("ptv_a");
    expect(readChaveDaRequisicao({}, { key: "ptv_b" })).toBe("ptv_b");
    expect(readChaveDaRequisicao({ "x-panel-key": "ptv_a" }, { key: "ptv_b" })).toBe("ptv_a");
    expect(readChaveDaRequisicao({}, {})).toBeNull();
  });

  it("recusa nome vazio e painel desconhecido, com a mensagem no campo", () => {
    const { erros } = parseChaveInput({ name: "  ", scopes: ["ti", "financeiro"] });
    expect(erros).toEqual([
      { path: "name", message: "Informe o nome da chave." },
      { path: "scopes", message: "Painel desconhecido: financeiro." },
    ]);
  });

  it("exige ao menos um painel", () => {
    expect(parseChaveInput({ name: "Recepção", scopes: [] }).erros).toEqual([
      { path: "scopes", message: "Escolha ao menos um painel." },
    ]);
  });

  it("aceita o formulário válido, sem repetir painel e com o nome aparado", () => {
    const { data, erros } = parseChaveInput({ name: "  TV da recepção ", scopes: ["mapa", "ti", "mapa"] });
    expect(erros).toEqual([]);
    expect(data).toEqual({ name: "TV da recepção", scopes: ["mapa", "ti"] });
  });
});
