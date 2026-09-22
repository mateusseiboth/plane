/**
 * Painel do mapa: onde cada entidade cai (coordenada gravada, senão o município
 * pelo nome da cidade), o agrupamento por cidade, os totais e a lista "Sem
 * localização". Puro — sem banco.
 */
import { describe, expect, it } from "bun:test";
import { buildMapa, normalizeCidade, resolveLocalDaEntidade, type EntidadeDoMapa } from "@modules/painel-tv/mapa/mapa";

const MUNICIPIOS = [
  { ibge: 5002704, nome: "Campo Grande", uf: "MS", lat: -20.4428, lon: -54.6464 },
  { ibge: 5003702, nome: "Dourados", uf: "MS", lat: -22.2231, lon: -54.812 },
  { ibge: 5007950, nome: "Selvíria", uf: "MS", lat: -20.3665, lon: -51.4246 },
];

const COORDENADAS = {
  "42": { sac: 204, lat: -20.37, lon: -51.42, cidade: "Selvíria", uf: "MS", ibge: 5007950 },
  "7": { sac: 12, lat: null, lon: null, cidade: "", uf: "", ibge: null },
};

const entidade = (over: Partial<EntidadeDoMapa> = {}): EntidadeDoMapa => ({
  id: "e1",
  nome: "Prefeitura",
  cidade: "Campo Grande",
  uf: "MS",
  legacyId: null,
  abertos: 0,
  urgentes: 0,
  ...over,
});

const dados = { municipios: MUNICIPIOS, coordenadas: COORDENADAS };

describe("nome da cidade", () => {
  it("ignora acento, caixa, espaço repetido e o sufixo do estado", () => {
    expect(normalizeCidade("  SÃO   Gabriel do Oeste/MS ")).toBe("sao gabriel do oeste");
    expect(normalizeCidade("Selvíria - MS")).toBe("selviria");
    expect(normalizeCidade("Figueirão")).toBe("figueirao");
    expect(normalizeCidade("Guia Lopes da Laguna")).toBe("guia lopes da laguna");
  });
});

describe("onde a entidade cai", () => {
  it("a coordenada gravada da entidade legada vem primeiro", () => {
    const local = resolveLocalDaEntidade(entidade({ legacyId: 42, cidade: "Campo Grande" }), dados);
    expect(local).toMatchObject({ lat: -20.37, lon: -51.42, ibge: 5007950, fonte: "entidade" });
  });

  it("entidade legada sem endereço gravado cai no município da cidade", () => {
    const local = resolveLocalDaEntidade(entidade({ legacyId: 7, cidade: "Dourados" }), dados);
    expect(local).toMatchObject({ ibge: 5003702, fonte: "municipio" });
  });

  it("sem coordenada gravada, casa a cidade com o município", () => {
    const local = resolveLocalDaEntidade(entidade({ cidade: "DOURADOS", uf: "ms" }), dados);
    expect(local).toMatchObject({ ibge: 5003702, lat: -22.2231, fonte: "municipio" });
  });

  it("cidade de outro estado ou desconhecida fica sem localização", () => {
    expect(resolveLocalDaEntidade(entidade({ cidade: "Curitiba", uf: "PR" }), dados)).toBeNull();
    expect(resolveLocalDaEntidade(entidade({ cidade: "Cidade Nova", uf: "MS" }), dados)).toBeNull();
    expect(resolveLocalDaEntidade(entidade({ cidade: null, uf: null }), dados)).toBeNull();
  });
});

describe("mapa", () => {
  it("soma as entidades da mesma cidade num ponto só, com o contador total", () => {
    const mapa = buildMapa({
      entidades: [
        entidade({ id: "a", nome: "Prefeitura de Campo Grande", abertos: 3, urgentes: 1 }),
        entidade({ id: "b", nome: "Câmara de Campo Grande", abertos: 2 }),
        entidade({ id: "c", nome: "Prefeitura de Dourados", cidade: "Dourados", abertos: 5 }),
      ],
      backups: [],
      ...dados,
    });
    const campoGrande = mapa.pontos.find((p) => p.ibge === 5002704)!;
    expect(campoGrande.abertos).toBe(5);
    expect(campoGrande.urgentes).toBe(1);
    expect(campoGrande.entidades.map((e) => e.nome)).toEqual(["Prefeitura de Campo Grande", "Câmara de Campo Grande"]);
    expect(mapa.total_abertos).toBe(10);
    expect(mapa.total_urgentes).toBe(1);
  });

  it("ordena os pontos e as top entidades pelo volume de chamados abertos", () => {
    const mapa = buildMapa({
      entidades: [
        entidade({ id: "a", nome: "Campo Grande", abertos: 1 }),
        entidade({ id: "b", nome: "Dourados", cidade: "Dourados", abertos: 7 }),
      ],
      backups: [],
      ...dados,
    });
    expect(mapa.pontos.map((p) => p.cidade)).toEqual(["Dourados", "Campo Grande"]);
    expect(mapa.top_entidades[0]).toMatchObject({ nome: "Dourados", abertos: 7 });
  });

  it("entidade sem cidade conhecida vai para a lista lateral, com os chamados dela", () => {
    const mapa = buildMapa({
      entidades: [entidade({ id: "z", nome: "Consórcio", cidade: "Cuiabá", uf: "MT", abertos: 4 })],
      backups: [],
      ...dados,
    });
    expect(mapa.pontos).toEqual([]);
    expect(mapa.sem_localizacao).toEqual([
      { id: "z", nome: "Consórcio", cidade: "Cuiabá", uf: "MT", abertos: 4, urgentes: 0 },
    ]);
  });

  it("marca no ponto e na entidade quem está com backup atrasado", () => {
    const mapa = buildMapa({
      entidades: [
        entidade({ id: "a", nome: "Campo Grande", abertos: 1 }),
        entidade({ id: "b", nome: "Dourados", cidade: "Dourados" }),
      ],
      backups: [
        {
          entity_id: "a",
          entidade: "Campo Grande",
          sistema: "Integração",
          ultimo_em: null,
          dias: 9,
          gravidade: "critico",
        },
      ],
      ...dados,
    });
    const campoGrande = mapa.pontos.find((p) => p.cidade === "Campo Grande")!;
    expect(campoGrande.backups_atrasados).toBe(1);
    expect(campoGrande.entidades[0]!.backup_atrasado).toBe(true);
    expect(mapa.pontos.find((p) => p.cidade === "Dourados")!.backups_atrasados).toBe(0);
  });

  it("marca a entidade com servidor offline e conta no ponto; sem informação fica neutra", () => {
    const mapa = buildMapa({
      entidades: [
        entidade({ id: "a", nome: "Campo Grande", abertos: 1 }),
        entidade({ id: "b", nome: "Dourados", cidade: "Dourados" }),
      ],
      backups: [],
      servidores: [{ entityId: "a", online: false }],
      ...dados,
    });
    const campoGrande = mapa.pontos.find((p) => p.cidade === "Campo Grande")!;
    expect(campoGrande.servidores_offline).toBe(1);
    expect(campoGrande.entidades[0]!.servidor).toBe("offline");
    expect(mapa.pontos.find((p) => p.cidade === "Dourados")!.entidades[0]!.servidor).toBeNull();
  });
});
