/**
 * Grade de widgets da página inicial: regras puras da ordem, do tamanho, da
 * junção entre o catálogo (nativos + instalados) e o que a pessoa salvou, e da
 * migração do que veio do formato antigo. Rodar com `bun test core/components/home`.
 */
import { describe, expect, it } from "bun:test";
import {
  buildAnuncioDaPosicao,
  buildChaveDeInstalado,
  buildLayoutPadrao,
  mergeLayout,
  moveWidget,
  moveWidgetAoLado,
  moveWidgetBy,
  normalizeTamanho,
  readIdDeInstalado,
  readManifestoDaHome,
  resolveLadoDaBorda,
  resolveVizinhoDoPasso,
  setLigado,
  setTamanho,
  toPreferencias,
  type TEntradaDoCatalogo,
  type TItemDaGrade,
} from "@/components/home/grade/grade-rules";

const CATALOGO: TEntradaDoCatalogo[] = [
  { chave: "mural", tamanhoPadrao: "1/1" },
  { chave: "meus_chamados", tamanhoPadrao: "2/3" },
  { chave: "perfil", tamanhoPadrao: "1/3" },
];

const chaves = (layout: TItemDaGrade[]) => layout.map((item) => item.chave);

describe("buildLayoutPadrao", () => {
  it("segue a ordem do catálogo, tudo ligado e no tamanho padrão de cada widget", () => {
    expect(buildLayoutPadrao(CATALOGO)).toEqual([
      { chave: "mural", tamanho: "1/1", ligado: true },
      { chave: "meus_chamados", tamanho: "2/3", ligado: true },
      { chave: "perfil", tamanho: "1/3", ligado: true },
    ]);
  });
});

describe("mergeLayout", () => {
  it("sem nada salvo é o layout padrão", () => {
    expect(mergeLayout(CATALOGO, [])).toEqual(buildLayoutPadrao(CATALOGO));
  });

  it("respeita a ordem, o tamanho e o desligado que a pessoa salvou", () => {
    const layout = mergeLayout(CATALOGO, [
      { chave: "perfil", ordem: 0, tamanho: "1/2", ligado: true },
      { chave: "mural", ordem: 1, tamanho: "1/1", ligado: false },
      { chave: "meus_chamados", ordem: 2, tamanho: "1/1", ligado: true },
    ]);
    expect(layout).toEqual([
      { chave: "perfil", tamanho: "1/2", ligado: true },
      { chave: "mural", tamanho: "1/1", ligado: false },
      { chave: "meus_chamados", tamanho: "1/1", ligado: true },
    ]);
  });

  it("widget novo no catálogo entra no fim, ligado e no tamanho padrão", () => {
    const layout = mergeLayout(CATALOGO, [
      { chave: "perfil", ordem: 0, tamanho: "1/3", ligado: true },
      { chave: "mural", ordem: 1, tamanho: "1/1", ligado: true },
    ]);
    expect(layout.at(-1)).toEqual({ chave: "meus_chamados", tamanho: "2/3", ligado: true });
  });

  it("widget que deixou de existir sai da grade", () => {
    const layout = mergeLayout(CATALOGO, [
      { chave: "widget:apagado", ordem: 0, tamanho: "1/2", ligado: true },
      { chave: "mural", ordem: 1, tamanho: "1/1", ligado: true },
    ]);
    expect(chaves(layout)).toEqual(["mural", "meus_chamados", "perfil"]);
  });

  it("tamanho inválido ou ausente volta ao padrão do widget", () => {
    const layout = mergeLayout(CATALOGO, [
      { chave: "mural", ordem: 0, tamanho: "3/4" as never, ligado: true },
      { chave: "perfil", ordem: 1, tamanho: null, ligado: true },
    ]);
    expect(layout[0].tamanho).toBe("1/1");
    expect(layout[1].tamanho).toBe("1/3");
  });

  it("migração do formato antigo: as chaves de antes somem e a pessoa fica com o padrão", () => {
    const layout = mergeLayout(CATALOGO, [
      { chave: "my_work_items", ordem: 0, tamanho: null, ligado: true },
      { chave: "recents", ordem: 1, tamanho: null, ligado: false },
    ]);
    expect(layout).toEqual(buildLayoutPadrao(CATALOGO));
  });

  it("chave repetida conta uma vez, a primeira pela ordem", () => {
    const layout = mergeLayout(CATALOGO, [
      { chave: "perfil", ordem: 3, tamanho: "1/1", ligado: true },
      { chave: "perfil", ordem: 0, tamanho: "1/3", ligado: false },
    ]);
    expect(layout.filter((item) => item.chave === "perfil")).toEqual([
      { chave: "perfil", tamanho: "1/3", ligado: false },
    ]);
    expect(layout[0].chave).toBe("perfil");
  });
});

describe("normalizeTamanho", () => {
  it("aceita as quatro frações e troca o resto pelo padrão", () => {
    expect(normalizeTamanho("1/2", "1/3")).toBe("1/2");
    expect(normalizeTamanho("1/1", "1/3")).toBe("1/1");
    expect(normalizeTamanho("50%", "1/3")).toBe("1/3");
    expect(normalizeTamanho(undefined, "2/3")).toBe("2/3");
  });
});

describe("reordenar", () => {
  const layout = buildLayoutPadrao(CATALOGO);

  it("moveWidget leva para a posição pedida, dentro dos limites", () => {
    expect(chaves(moveWidget(layout, "perfil", 0))).toEqual(["perfil", "mural", "meus_chamados"]);
    expect(chaves(moveWidget(layout, "mural", 99))).toEqual(["meus_chamados", "perfil", "mural"]);
    expect(chaves(moveWidget(layout, "mural", -3))).toEqual(chaves(layout));
  });

  it("moveWidgetBy anda uma casa para cada lado (setas e teclado)", () => {
    expect(chaves(moveWidgetBy(layout, "meus_chamados", -1))).toEqual(["meus_chamados", "mural", "perfil"]);
    expect(chaves(moveWidgetBy(layout, "meus_chamados", 1))).toEqual(["mural", "perfil", "meus_chamados"]);
  });

  it("moveWidgetAoLado solta antes ou depois do alvo (arrastar e soltar)", () => {
    expect(chaves(moveWidgetAoLado(layout, "perfil", "mural", "antes"))).toEqual(["perfil", "mural", "meus_chamados"]);
    expect(chaves(moveWidgetAoLado(layout, "mural", "perfil", "depois"))).toEqual(["meus_chamados", "perfil", "mural"]);
    expect(chaves(moveWidgetAoLado(layout, "mural", "meus_chamados", "antes"))).toEqual(chaves(layout));
  });

  it("chave desconhecida não mexe na grade", () => {
    expect(moveWidget(layout, "nada", 0)).toEqual(layout);
    expect(moveWidgetAoLado(layout, "mural", "nada", "antes")).toEqual(layout);
  });
});

describe("teclado e soltura entre os visíveis", () => {
  const visiveis = buildLayoutPadrao(CATALOGO);

  it("anterior e próximo apontam o vizinho visível; nas pontas não há para onde ir", () => {
    expect(resolveVizinhoDoPasso(visiveis, "meus_chamados", "anterior")).toEqual({ alvo: "mural", lado: "antes" });
    expect(resolveVizinhoDoPasso(visiveis, "meus_chamados", "proximo")).toEqual({ alvo: "perfil", lado: "depois" });
    expect(resolveVizinhoDoPasso(visiveis, "mural", "anterior")).toBeNull();
    expect(resolveVizinhoDoPasso(visiveis, "perfil", "proximo")).toBeNull();
  });

  it("primeiro e último levam para as pontas", () => {
    expect(resolveVizinhoDoPasso(visiveis, "perfil", "primeiro")).toEqual({ alvo: "mural", lado: "antes" });
    expect(resolveVizinhoDoPasso(visiveis, "mural", "ultimo")).toEqual({ alvo: "perfil", lado: "depois" });
    expect(resolveVizinhoDoPasso(visiveis, "mural", "primeiro")).toBeNull();
  });

  it("borda de cima ou da esquerda é antes; de baixo ou da direita é depois", () => {
    expect(resolveLadoDaBorda("top")).toBe("antes");
    expect(resolveLadoDaBorda("left")).toBe("antes");
    expect(resolveLadoDaBorda("bottom")).toBe("depois");
    expect(resolveLadoDaBorda("right")).toBe("depois");
    expect(resolveLadoDaBorda(null)).toBe("depois");
  });
});

describe("tamanho e ligado", () => {
  const layout = buildLayoutPadrao(CATALOGO);

  it("setTamanho troca só o widget pedido", () => {
    expect(setTamanho(layout, "perfil", "1/2")[2]).toEqual({ chave: "perfil", tamanho: "1/2", ligado: true });
    expect(setTamanho(layout, "perfil", "1/2")[0]).toBe(layout[0]);
  });

  it("setLigado desliga sem tirar o widget do lugar", () => {
    const desligado = setLigado(layout, "mural", false);
    expect(desligado[0]).toEqual({ chave: "mural", tamanho: "1/1", ligado: false });
    expect(chaves(desligado)).toEqual(chaves(layout));
  });
});

describe("toPreferencias", () => {
  it("numera a ordem pela posição e guarda os que não estão no catálogo agora no fim", () => {
    const layout = moveWidget(buildLayoutPadrao(CATALOGO), "perfil", 0);
    expect(toPreferencias(layout, [{ chave: "widget:fora-do-ar", ordem: 0, tamanho: "1/2", ligado: true }])).toEqual([
      { chave: "perfil", ordem: 0, tamanho: "1/3", ligado: true },
      { chave: "mural", ordem: 1, tamanho: "1/1", ligado: true },
      { chave: "meus_chamados", ordem: 2, tamanho: "2/3", ligado: true },
      { chave: "widget:fora-do-ar", ordem: 3, tamanho: "1/2", ligado: true },
    ]);
  });
});

describe("widgets instalados", () => {
  it("a chave de um instalado é widget:<id>, e o id volta dela", () => {
    expect(buildChaveDeInstalado("abc-123")).toBe("widget:abc-123");
    expect(readIdDeInstalado("widget:abc-123")).toBe("abc-123");
    expect(readIdDeInstalado("mural")).toBeNull();
  });

  it("o manifesto dá título e tamanho padrão; sem eles, o nome e meia largura", () => {
    expect(readManifestoDaHome({ title: "Fila", defaultSize: "2/3" }, "Fila do suporte")).toEqual({
      titulo: "Fila",
      tamanhoPadrao: "2/3",
    });
    expect(readManifestoDaHome({ defaultSize: "3/4", title: 42 }, "Fila do suporte")).toEqual({
      titulo: "Fila do suporte",
      tamanhoPadrao: "1/2",
    });
    expect(readManifestoDaHome(null, "Fila do suporte").tamanhoPadrao).toBe("1/2");
  });
});

describe("buildAnuncioDaPosicao", () => {
  it("diz para o leitor de tela onde o widget ficou", () => {
    expect(buildAnuncioDaPosicao("Tarefas", 1, 7)).toBe("Tarefas movido para a posição 2 de 7.");
  });
});
