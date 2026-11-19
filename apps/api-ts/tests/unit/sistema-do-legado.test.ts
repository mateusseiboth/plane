/**
 * Como um sistema do legado (`quality_site.sistemas`) vira sistema no Plane
 * (testes da nova intranet 3, 18/11/2026):
 *
 *  - o legado tem dois "Licitação", dois "Recursos Humanos", dois "Frotas"...:
 *    um desktop e um web. A intranet mostra "(WEB)" ao lado dos de categoria 3;
 *    aqui o indicador vai no próprio nome: "Licitação Web".
 *  - todos estão com status 1. Os inativos são a lista fixa que a intranet
 *    esconde no seletor de sistema (funcoesAjaxTickets.php): no Plane eles são
 *    arquivados.
 */
import { describe, expect, it } from "bun:test";
import {
  buildAjusteDoSistema,
  buildNomeDoSistema,
  isSistemaInativoNoLegado,
} from "@modules/project/sistema-do-legado.rules";

const sistema = (extra: Partial<Parameters<typeof buildNomeDoSistema>[0]>) => ({
  sistemas_id: 8,
  sistemas_nome: "Licitação",
  sistemas_apelido: "",
  categoria: 0,
  ...extra,
});

describe("buildNomeDoSistema", () => {
  it("sistema desktop fica com o nome do legado", () => {
    expect(buildNomeDoSistema(sistema({}))).toBe("Licitação");
  });

  it("sistema web (categoria 3) leva 'Web' depois do nome", () => {
    expect(buildNomeDoSistema(sistema({ sistemas_id: 139, categoria: 3 }))).toBe("Licitação Web");
  });

  it("nome que já diz web não repete", () => {
    expect(buildNomeDoSistema(sistema({ sistemas_nome: "Almoxarifado Web", categoria: 3 }))).toBe("Almoxarifado Web");
    expect(buildNomeDoSistema(sistema({ sistemas_nome: "Protocolo Web (descontinuado)", categoria: 3 }))).toBe(
      "Protocolo Web (descontinuado)"
    );
  });

  it("'Web' entra antes da observação entre parênteses", () => {
    expect(buildNomeDoSistema(sistema({ sistemas_nome: "GED (descontinuado)", categoria: 3 }))).toBe(
      "GED Web (descontinuado)"
    );
  });

  it("o apelido, quando existe, vale mais que o nome", () => {
    expect(buildNomeDoSistema(sistema({ sistemas_apelido: "Licitações e Contratos", categoria: 3 }))).toBe(
      "Licitações e Contratos Web"
    );
  });

  it("sem nome nem apelido, usa o número do legado", () => {
    expect(buildNomeDoSistema(sistema({ sistemas_nome: null, sistemas_apelido: null }))).toBe("Sistema 8");
  });

  it("respeita o tamanho da coluna", () => {
    expect(buildNomeDoSistema(sistema({ sistemas_nome: "x".repeat(300), categoria: 3 })).length).toBe(255);
  });
});

describe("isSistemaInativoNoLegado", () => {
  it("os dez que a intranet esconde são inativos", () => {
    for (const id of [65, 12, 70, 55, 21, 22, 24, 103, 104, 105]) expect(isSistemaInativoNoLegado(id)).toBe(true);
  });

  it("os demais seguem ativos", () => {
    expect(isSistemaInativoNoLegado(8)).toBe(false);
    expect(isSistemaInativoNoLegado(139)).toBe(false);
  });
});

describe("buildAjusteDoSistema (o que já foi importado)", () => {
  const agora = new Date("2026-11-19T12:00:00Z");

  it("sistema web ainda com o nome da importação ganha o 'Web'", () => {
    expect(
      buildAjusteDoSistema({ name: "Licitação", archivedAt: null }, sistema({ sistemas_id: 139, categoria: 3 }), agora)
    ).toEqual({ name: "Licitação Web" });
  });

  it("nome importado com o espaço do legado ('Licitação ') também é acertado", () => {
    expect(
      buildAjusteDoSistema(
        { name: "Licitação ", archivedAt: null },
        sistema({ sistemas_id: 139, sistemas_nome: "Licitação ", categoria: 3 }),
        agora
      )
    ).toEqual({ name: "Licitação Web" });
  });

  it("nome trocado à mão no Plane não é desfeito", () => {
    expect(
      buildAjusteDoSistema({ name: "Licitação Nuvem", archivedAt: null }, sistema({ categoria: 3 }), agora)
    ).toEqual({});
  });

  it("sistema inativo no legado é arquivado", () => {
    expect(
      buildAjusteDoSistema(
        { name: "Mala Direta", archivedAt: null },
        sistema({ sistemas_id: 22, sistemas_nome: "Mala Direta" }),
        agora
      )
    ).toEqual({ archivedAt: agora });
  });

  it("já arquivado ou já com o nome certo: nada a fazer", () => {
    const arquivado = new Date("2026-01-01T00:00:00Z");
    expect(
      buildAjusteDoSistema(
        { name: "Mala Direta", archivedAt: arquivado },
        sistema({ sistemas_id: 22, sistemas_nome: "Mala Direta" }),
        agora
      )
    ).toEqual({});
    expect(buildAjusteDoSistema({ name: "Licitação Web", archivedAt: null }, sistema({ categoria: 3 }), agora)).toEqual(
      {}
    );
  });
});
