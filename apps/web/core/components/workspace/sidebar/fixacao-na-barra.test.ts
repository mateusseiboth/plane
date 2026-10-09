/**
 * Regra de fixação da barra lateral: qual item aparece na barra e qual fica no
 * menu Mais, dado o que a pessoa gravou. Puro.
 * Rodar com `bun test core/components/workspace/sidebar`.
 */
import { describe, expect, it } from "bun:test";
import { ITENS_DO_MENU_MAIS, buildItensDaBarra, buildItensDoMenuMais, isItemFixadoNaBarra } from "./fixacao-na-barra";

const item = (key: string) => ({ key });

// O que a barra mostrava para quem nunca mexeu nas preferências.
const FIXADOS_DE_FABRICA = [
  "your_work",
  "drafts",
  "projects",
  "all-work-items",
  "global-intake",
  "visits",
  "contatos",
  "mural",
  "wiki",
  "ouvidoria",
  "denuncias",
  "curriculos",
  "pos-atendimento",
  "links-uteis",
  "reports",
];
const DESFIXADOS_DE_FABRICA = ["stickies", "chat", "views", "analytics", "archives"];

describe("isItemFixadoNaBarra", () => {
  it.each(FIXADOS_DE_FABRICA)("%s fica na barra enquanto a pessoa não mexe", (chave) => {
    expect(isItemFixadoNaBarra(chave, {})).toBe(true);
  });

  it.each(DESFIXADOS_DE_FABRICA)("%s fica só no Mais enquanto a pessoa não mexe", (chave) => {
    expect(isItemFixadoNaBarra(chave, {})).toBe(false);
  });

  it.each(ITENS_DO_MENU_MAIS.map((i) => i.key))("%s obedece a escolha gravada nos dois sentidos", (chave) => {
    expect(isItemFixadoNaBarra(chave, { [chave]: { is_pinned: false, sort_order: 0 } })).toBe(false);
    expect(isItemFixadoNaBarra(chave, { [chave]: { is_pinned: true, sort_order: 0 } })).toBe(true);
  });

  it("a Página inicial fica na barra mesmo desfixada", () => {
    expect(isItemFixadoNaBarra("home", { home: { is_pinned: false, sort_order: 0 } })).toBe(true);
  });

  it("preferência gravada sem o campo de fixação cai no padrão do item", () => {
    expect(isItemFixadoNaBarra("mural", { mural: { sort_order: 3 } })).toBe(true);
    expect(isItemFixadoNaBarra("chat", { chat: { sort_order: 3 } })).toBe(false);
  });
});

describe("ITENS_DO_MENU_MAIS", () => {
  it("traz todo item do catálogo, do espaço e pessoal, menos a Página inicial", () => {
    const esperadas = [...FIXADOS_DE_FABRICA, ...DESFIXADOS_DE_FABRICA];
    const chaves = ITENS_DO_MENU_MAIS.map((i) => i.key);
    expect(chaves).toHaveLength(esperadas.length);
    expect(new Set(chaves)).toEqual(new Set(esperadas));
  });
});

describe("buildItensDaBarra", () => {
  it("tira da barra o que a pessoa desfixou e põe o que ela fixou", () => {
    const itens = [item("mural"), item("wiki"), item("chat")];
    const naBarra = buildItensDaBarra(itens, {
      wiki: { is_pinned: false, sort_order: 0 },
      chat: { is_pinned: true, sort_order: 0 },
    });
    expect(naBarra.map((i) => i.key)).toEqual(["mural", "chat"]);
  });

  it("ordena pela ordem gravada e mantém a do catálogo no empate", () => {
    const itens = [item("mural"), item("wiki"), item("contatos")];
    const naBarra = buildItensDaBarra(itens, { contatos: { is_pinned: true, sort_order: -10 } });
    expect(naBarra.map((i) => i.key)).toEqual(["contatos", "mural", "wiki"]);
  });
});

describe("buildItensDoMenuMais", () => {
  it("lista fixados primeiro e desfixados depois, cada um com o estado resolvido", () => {
    const itens = [item("chat"), item("mural"), item("wiki")];
    const mais = buildItensDoMenuMais(itens, { mural: { is_pinned: false, sort_order: 0 } });
    expect(mais.map((i) => [i.key, i.is_pinned])).toEqual([
      ["wiki", true],
      ["chat", false],
      ["mural", false],
    ]);
  });

  it("não oferece a Página inicial para desfixar", () => {
    expect(buildItensDoMenuMais([item("home"), item("mural")], {}).map((i) => i.key)).toEqual(["mural"]);
  });
});
