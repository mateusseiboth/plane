/**
 * Preferências dos widgets da página inicial: leitura do que está gravado
 * (formato novo e migração do formato antigo), validação do que a tela envia e
 * a montagem do JSON gravado sem perder o resto das preferências. Sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildDisplayFilters, parsePreferencias, readPreferenciasSalvas } from "@modules/home/widgets.rules";

const capture = (run: () => unknown) => {
  try {
    run();
  } catch (erro) {
    return erro as { status: number; message: string; errors: { path: string; message: string }[] };
  }
  throw new Error("era para recusar");
};

describe("readPreferenciasSalvas", () => {
  it("sem nada gravado devolve lista vazia (a tela usa o layout padrão)", () => {
    expect(readPreferenciasSalvas(undefined)).toEqual([]);
    expect(readPreferenciasSalvas({})).toEqual([]);
    expect(readPreferenciasSalvas({ quick_links: [] })).toEqual([]);
  });

  it("formato novo volta na ordem gravada, renumerada a partir de zero", () => {
    const lido = readPreferenciasSalvas({
      home_widgets: [
        { chave: "tarefas", ordem: 7, tamanho: "2/3", ligado: true },
        { chave: "mural", ordem: 2, tamanho: "1/1", ligado: false },
      ],
    });
    expect(lido).toEqual([
      { chave: "mural", ordem: 0, tamanho: "1/1", ligado: false },
      { chave: "tarefas", ordem: 1, tamanho: "2/3", ligado: true },
    ]);
  });

  it("tamanho inválido vira null (o widget usa o padrão dele) e item sem chave some", () => {
    const lido = readPreferenciasSalvas({
      home_widgets: [
        { chave: "perfil", ordem: 0, tamanho: "3/4", ligado: "sim" },
        { ordem: 1, tamanho: "1/3", ligado: true },
        { chave: "perfil", ordem: 2, tamanho: "1/3", ligado: true },
        "lixo",
      ],
    });
    expect(lido).toEqual([{ chave: "perfil", ordem: 0, tamanho: null, ligado: true }]);
  });

  it("migra o formato antigo: maior sort_order primeiro, ligado vem de is_enabled, tamanho fica no padrão", () => {
    const lido = readPreferenciasSalvas({
      widget_preferences: {
        recents: { is_enabled: false, sort_order: 3 },
        my_work_items: { is_enabled: true, sort_order: 7 },
        quick_links: { sort_order: 4 },
      },
    });
    expect(lido).toEqual([
      { chave: "my_work_items", ordem: 0, tamanho: null, ligado: true },
      { chave: "quick_links", ordem: 1, tamanho: null, ligado: true },
      { chave: "recents", ordem: 2, tamanho: null, ligado: false },
    ]);
  });

  it("com os dois formatos gravados, vale o novo", () => {
    const lido = readPreferenciasSalvas({
      widget_preferences: { recents: { is_enabled: true, sort_order: 1 } },
      home_widgets: [{ chave: "mural", ordem: 0, tamanho: "1/1", ligado: true }],
    });
    expect(lido.map((w) => w.chave)).toEqual(["mural"]);
  });
});

describe("parsePreferencias", () => {
  it("aceita a lista, ordena pela ordem enviada e renumera", () => {
    const widgets = parsePreferencias({
      widgets: [
        { chave: "widget:0198c1d2-aaaa-7bbb-8ccc-123456789abc", ordem: 5, tamanho: "1/2", ligado: true },
        { chave: "mural", ordem: 1, tamanho: "1/1", ligado: false },
      ],
    });
    expect(widgets).toEqual([
      { chave: "mural", ordem: 0, tamanho: "1/1", ligado: false },
      { chave: "widget:0198c1d2-aaaa-7bbb-8ccc-123456789abc", ordem: 1, tamanho: "1/2", ligado: true },
    ]);
  });

  it("sem a lista recusa no campo widgets", () => {
    const erro = capture(() => parsePreferencias({}));
    expect(erro.status).toBe(400);
    expect(erro.errors).toEqual([{ path: "widgets", message: "Envie a lista de widgets." }]);
  });

  it("cada campo inválido volta com o caminho do item", () => {
    const erro = capture(() =>
      parsePreferencias({
        widgets: [
          { chave: "mural", ordem: 0, tamanho: "3/4", ligado: true },
          { chave: "Tarefas Novas!", ordem: -1, tamanho: "1/3", ligado: "sim" },
          { chave: "mural", ordem: 2, tamanho: "1/3", ligado: true },
        ],
      })
    );
    expect(erro.status).toBe(400);
    expect(erro.errors.map((e) => e.path)).toEqual([
      "widgets[0].tamanho",
      "widgets[1].chave",
      "widgets[1].ordem",
      "widgets[1].ligado",
      "widgets[2].chave",
    ]);
    expect(erro.errors[0].message).toBe("Escolha um tamanho: 1/3, 1/2, 2/3 ou inteiro.");
    expect(erro.errors[4].message).toBe("Este widget já está na lista.");
  });

  it("recusa lista grande demais", () => {
    const widgets = Array.from({ length: 101 }, (_, i) => ({ chave: `w${i}`, ordem: i, tamanho: "1/3", ligado: true }));
    expect(capture(() => parsePreferencias({ widgets })).errors[0].path).toBe("widgets");
  });
});

describe("buildDisplayFilters", () => {
  it("grava no formato novo, apaga o antigo e mantém o resto das preferências", () => {
    const widgets = [{ chave: "mural", ordem: 0, tamanho: "1/1" as const, ligado: true }];
    expect(buildDisplayFilters({ quick_links: [{ id: "1" }], widget_preferences: { recents: {} } }, widgets)).toEqual({
      quick_links: [{ id: "1" }],
      home_widgets: widgets,
    });
    expect(buildDisplayFilters(null, widgets)).toEqual({ home_widgets: widgets });
  });
});
