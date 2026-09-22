/**
 * Ícone de cada sistema (projeto) vindo do painel de TV do SAC: o
 * `external_id` do projeto migrado é o `sistemas_id` do legado, a mesma chave
 * do sprite de ícones. O ícone escolhido à mão no Plane nunca é trocado.
 */
import { describe, expect, it } from "bun:test";
import { buildIconeDoSistema, planIconesDosSistemas } from "@utils/icones-dos-sistemas";

const ICONE_5 = "data:image/png;base64,AAAA";
const ICONES = { "5": ICONE_5, "13": "data:image/png;base64,BBBB" };

const projeto = (
  id: string,
  externalId: string | null,
  iconProp: unknown = null,
  externalSource = "sac_migration"
) => ({
  id,
  externalSource,
  externalId,
  iconProp,
});

describe("buildIconeDoSistema", () => {
  it("monta o logo no modo imagem", () => {
    expect(buildIconeDoSistema(ICONE_5)).toEqual({ in_use: "image", image: { url: ICONE_5 } });
  });
});

describe("planIconesDosSistemas", () => {
  it("dá o ícone ao sistema migrado sem logo", () => {
    expect(planIconesDosSistemas([projeto("p1", "5")], ICONES)).toEqual([
      { projectId: "p1", iconProp: { in_use: "image", image: { url: ICONE_5 } } },
    ]);
  });

  it("não troca emoji nem ícone escolhidos no Plane", () => {
    const emoji = { in_use: "emoji", emoji: { value: "128187" } };
    const icone = { in_use: "icon", icon: { name: "home" } };
    expect(planIconesDosSistemas([projeto("p1", "5", emoji), projeto("p2", "13", icone)], ICONES)).toEqual([]);
  });

  it("é idempotente: mesma imagem não gera atualização", () => {
    const jaTem = { in_use: "image", image: { url: ICONE_5 } };
    expect(planIconesDosSistemas([projeto("p1", "5", jaTem)], ICONES)).toEqual([]);
  });

  it("atualiza a imagem antiga do próprio import", () => {
    const antiga = { in_use: "image", image: { url: "data:image/png;base64,VELHO" } };
    expect(planIconesDosSistemas([projeto("p1", "5", antiga)], ICONES)).toHaveLength(1);
  });

  it("ignora sistema sem ícone no sprite e projeto criado no Plane", () => {
    const projetos = [projeto("p1", "999"), projeto("p2", "5", null, "plane"), projeto("p3", null)];
    expect(planIconesDosSistemas(projetos, ICONES)).toEqual([]);
  });
});
