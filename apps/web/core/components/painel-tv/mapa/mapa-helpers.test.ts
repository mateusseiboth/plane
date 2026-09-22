/**
 * Regras puras do mapa de chamados: tamanho do marcador, afastamento de cidades
 * vizinhas, escolha entre o mapa de tiles e o desenho de reserva, e a máscara
 * que escurece o que está fora do estado.
 *
 * Rodar com `bun test core/components/painel-tv`.
 */
import { describe, expect, it } from "bun:test";
import {
  ANEL_DO_MUNDO,
  ERROS_ATE_A_RESERVA,
  buildMascaraDeFora,
  readAneisDaMalha,
  readContornoDoEstado,
  readFonteDoMapa,
  readLimitesDoEnquadramento,
  readRaioDoMarcador,
  spreadPontosProximos,
} from "./mapa-helpers";

const distancia = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) =>
  Math.hypot(a.lat - b.lat, a.lon - b.lon);

describe("tamanho do marcador", () => {
  it("é discreto e cresce só o bastante para o número caber dentro", () => {
    expect(readRaioDoMarcador(0)).toBe(10);
    expect(readRaioDoMarcador(9)).toBe(10);
    expect(readRaioDoMarcador(10)).toBe(11);
    expect(readRaioDoMarcador(120)).toBe(13);
  });
});

describe("enquadramento do mapa", () => {
  const estado = { sul: -24.07, oeste: -58.17, norte: -17.17, leste: -50.92 };

  it("com cidades, enquadra as cidades: o estado inteiro deixaria tudo distante", () => {
    const pontos = [
      { chave: "a", lat: -18.1, lon: -54.5 },
      { chave: "b", lat: -23.1, lon: -55.2 },
      { chave: "c", lat: -20.4, lon: -57.6 },
    ];
    expect(readLimitesDoEnquadramento(pontos, estado)).toEqual({
      sul: -23.1,
      oeste: -57.6,
      norte: -18.1,
      leste: -54.5,
    });
  });

  it("com menos de duas cidades, volta ao estado inteiro", () => {
    expect(readLimitesDoEnquadramento([], estado)).toEqual(estado);
    expect(readLimitesDoEnquadramento([{ chave: "a", lat: -20, lon: -54 }], estado)).toEqual(estado);
  });

  it("cidade fora do estado não puxa o enquadramento", () => {
    const pontos = [
      { chave: "a", lat: -18.1, lon: -54.5 },
      { chave: "b", lat: -23.1, lon: -55.2 },
      { chave: "mt", lat: -15.6, lon: -56.1 },
    ];
    expect(readLimitesDoEnquadramento(pontos, estado)).toEqual({
      sul: -23.1,
      oeste: -55.2,
      norte: -18.1,
      leste: -54.5,
    });
  });
});

describe("afastamento de cidades vizinhas", () => {
  const MINIMA = 0.2;

  it("cidade sozinha não sai do lugar", () => {
    const posicoes = spreadPontosProximos([{ chave: "campo-grande", lat: -20.44, lon: -54.64 }], MINIMA);
    expect(posicoes.get("campo-grande")).toEqual({ lat: -20.44, lon: -54.64 });
  });

  it("cidades coladas são separadas o bastante para os dois números aparecerem", () => {
    const posicoes = spreadPontosProximos(
      [
        { chave: "a", lat: -20.4, lon: -54.6 },
        { chave: "b", lat: -20.41, lon: -54.61 },
      ],
      MINIMA
    );
    expect(distancia(posicoes.get("a")!, posicoes.get("b")!)).toBeGreaterThanOrEqual(MINIMA);
  });

  it("cidades distantes continuam onde estão", () => {
    const pontos = [
      { chave: "corumba", lat: -19.0, lon: -57.65 },
      { chave: "dourados", lat: -22.22, lon: -54.81 },
    ];
    const posicoes = spreadPontosProximos(pontos, MINIMA);
    expect(posicoes.get("corumba")).toEqual({ lat: -19.0, lon: -57.65 });
    expect(posicoes.get("dourados")).toEqual({ lat: -22.22, lon: -54.81 });
  });

  it("o resultado não depende da ordem em que os pontos chegam", () => {
    const pontos = [
      { chave: "a", lat: -20.4, lon: -54.6 },
      { chave: "b", lat: -20.41, lon: -54.61 },
      { chave: "c", lat: -20.42, lon: -54.6 },
    ];
    const daOrdem = spreadPontosProximos(pontos, MINIMA);
    // oxlint-disable-next-line unicorn/no-array-reverse
    const doAvesso = spreadPontosProximos([...pontos].reverse(), MINIMA);
    // oxlint-disable-next-line unicorn/no-array-sort
    expect([...daOrdem.entries()].sort()).toEqual([...doAvesso.entries()].sort());
  });
});

describe("mapa de tiles ou desenho de reserva", () => {
  it("sem rede, vai direto para o desenho de reserva", () => {
    expect(readFonteDoMapa({ isOnline: false, tilesCarregados: 0, errosDeTile: 0 })).toBe("reserva");
  });

  it("com rede e sem erro, usa os tiles", () => {
    expect(readFonteDoMapa({ isOnline: true, tilesCarregados: 0, errosDeTile: 0 })).toBe("tiles");
  });

  it("erros seguidos no começo derrubam para a reserva", () => {
    expect(readFonteDoMapa({ isOnline: true, tilesCarregados: 0, errosDeTile: ERROS_ATE_A_RESERVA })).toBe("reserva");
  });

  it("tile que já pintou segura o mapa: erro depois não apaga a tela", () => {
    expect(readFonteDoMapa({ isOnline: true, tilesCarregados: 12, errosDeTile: 40 })).toBe("tiles");
  });
});

describe("máscara do que está fora do estado", () => {
  const malha = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { ibge: 5002704 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-54, -20],
              [-53, -20],
              [-53, -21],
              [-54, -20],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { ibge: 5003702 },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [-55, -22],
                [-54, -22],
                [-54, -23],
                [-55, -22],
              ],
            ],
          ],
        },
      },
    ],
  };

  it("lê os anéis de Polygon e de MultiPolygon", () => {
    expect(readAneisDaMalha(malha)).toHaveLength(2);
  });

  it("o primeiro anel é o mundo e os demais viram buracos em lat/lon", () => {
    const mascara = buildMascaraDeFora(readAneisDaMalha(malha));
    expect(mascara[0]).toEqual(ANEL_DO_MUNDO);
    expect(mascara).toHaveLength(3);
    expect(mascara[1]![0]).toEqual([-20, -54]);
  });
});

describe("contorno do estado", () => {
  // Dois municípios quadrados lado a lado: a divisa entre eles é a única aresta
  // que os dois têm, e é justamente a que não pode virar contorno do estado.
  const esquerda = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
  const direita = [
    [1, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 0],
  ];

  it("a divisa entre dois municípios vizinhos não entra no contorno", () => {
    const contorno = readContornoDoEstado([esquerda, direita]);
    const divisa = contorno.filter(
      (segmento) => segmento[0]![1] === 1 && segmento[1]![1] === 1 && segmento[0]![0] !== segmento[1]![0]
    );
    expect(divisa).toEqual([]);
    expect(contorno).toHaveLength(6);
  });

  it("município sozinho tem todas as arestas no contorno", () => {
    expect(readContornoDoEstado([esquerda])).toHaveLength(4);
  });
});
