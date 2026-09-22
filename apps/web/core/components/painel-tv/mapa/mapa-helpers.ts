/**
 * Regras puras do mapa de chamados. Nada de React, nada de Leaflet: dá para
 * testar o afastamento das cidades e a queda para o desenho de reserva sem
 * navegador nenhum.
 */

/**
 * Raio do marcador pelo volume: discreto, para o mapa aparecer por baixo, e
 * só o bastante para o número caber dentro.
 */
export function readRaioDoMarcador(abertos: number): number {
  if (abertos >= 100) return 13;
  if (abertos >= 10) return 11;
  return 10;
}

export type PontoNoMapa = { chave: string; lat: number; lon: number };
export type PosicaoDoPonto = { lat: number; lon: number };

export type LimitesDoMapa = { sul: number; oeste: number; norte: number; leste: number };

const isDentro = (ponto: PontoNoMapa, limites: LimitesDoMapa) =>
  ponto.lat >= limites.sul && ponto.lat <= limites.norte && ponto.lon >= limites.oeste && ponto.lon <= limites.leste;

/**
 * O que a TV enquadra: as cidades com entidade, não o polígono do estado. As
 * pontas do MS (Sonora ao norte, Mundo Novo ao sul) não têm cliente e o
 * estado inteiro deixava tudo pequeno. Cidade fora do estado (cadastro de MT)
 * não puxa o enquadramento; com menos de duas cidades, vale o estado.
 */
export function readLimitesDoEnquadramento(pontos: PontoNoMapa[], estado: LimitesDoMapa): LimitesDoMapa {
  const dentro = pontos.filter((ponto) => isDentro(ponto, estado));
  if (dentro.length < 2) return estado;
  const lats = dentro.map((p) => p.lat);
  const lons = dentro.map((p) => p.lon);
  return { sul: Math.min(...lats), oeste: Math.min(...lons), norte: Math.max(...lats), leste: Math.max(...lons) };
}

/**
 * Quanto duas cidades precisam distar para os dois marcadores caberem lado a
 * lado no mapa de MS na TV. Em graus, que é a unidade do cadastro: 0,16° são
 * uns 17 km, o bastante para os marcadores pequenos não se encavalarem.
 */
export const DISTANCIA_MINIMA_EM_GRAUS = 0.16;

const TAU = Math.PI * 2;

/** Ordem estável: o desenho não pode mudar porque a API devolveu outra ordem. */
const porChave = (a: PontoNoMapa, b: PontoNoMapa) => a.chave.localeCompare(b.chave);

const distanciaEmGraus = (a: PontoNoMapa, b: PontoNoMapa) => Math.hypot(a.lat - b.lat, a.lon - b.lon);

/** Cidades que caem quase no mesmo lugar, agrupadas em volta da primeira. */
function groupPontosProximos(pontos: PontoNoMapa[], distanciaMinima: number): PontoNoMapa[][] {
  // A cópia é local e nasce aqui: ordenar no lugar não mexe em nada de fora.
  // oxlint-disable-next-line unicorn/no-array-sort
  const pendentes = [...pontos].sort(porChave);
  const grupos: PontoNoMapa[][] = [];

  while (pendentes.length > 0) {
    const ancora = pendentes.shift()!;
    const grupo = [ancora];
    for (let i = pendentes.length - 1; i >= 0; i -= 1) {
      if (distanciaEmGraus(ancora, pendentes[i]!) >= distanciaMinima) continue;
      grupo.unshift(...pendentes.splice(i, 1));
    }
    // oxlint-disable-next-line unicorn/no-array-sort
    grupos.push(grupo.sort(porChave));
  }
  return grupos;
}

/**
 * Onde DESENHAR cada cidade. Cidades vizinhas (Campo Grande e Sidrolândia,
 * Dourados e Itaporã) se sobrepõem no mapa e um marcador some dentro do outro;
 * aqui elas viram uma roseta em volta do ponto do meio, sem perder a região.
 *
 * O cadastro não muda: só a posição de desenho.
 */
export function spreadPontosProximos(pontos: PontoNoMapa[], distanciaMinima: number): Map<string, PosicaoDoPonto> {
  const posicoes = new Map<string, PosicaoDoPonto>();

  for (const grupo of groupPontosProximos(pontos, distanciaMinima)) {
    if (grupo.length === 1) {
      posicoes.set(grupo[0]!.chave, { lat: grupo[0]!.lat, lon: grupo[0]!.lon });
      continue;
    }
    const meioLat = grupo.reduce((soma, p) => soma + p.lat, 0) / grupo.length;
    const meioLon = grupo.reduce((soma, p) => soma + p.lon, 0) / grupo.length;
    grupo.forEach((ponto, indice) => {
      const angulo = (indice / grupo.length) * TAU;
      posicoes.set(ponto.chave, {
        lat: meioLat + distanciaMinima * Math.sin(angulo),
        lon: meioLon + distanciaMinima * Math.cos(angulo),
      });
    });
  }

  return posicoes;
}

export const FONTES_DO_MAPA = ["tiles", "reserva"] as const;
export type FonteDoMapa = (typeof FONTES_DO_MAPA)[number];

/** Erros de tile seguidos, no começo, que bastam para desistir dos tiles. */
export const ERROS_ATE_A_RESERVA = 3;

export type EstadoDosTiles = { isOnline: boolean; tilesCarregados: number; errosDeTile: number };

/**
 * A TV pode estar numa rede sem saída para a internet, e aí o mapa de tiles
 * fica cinza justamente ali. Quando os tiles não vêm, o painel cai para o
 * desenho de reserva, que é feito com o GeoJSON do repositório.
 *
 * Tile que já pintou segura o mapa: erro depois disso é buraco de cobertura no
 * zoom, não rede caída, e apagar a tela inteira por causa dele seria pior.
 */
export function readFonteDoMapa(estado: EstadoDosTiles): FonteDoMapa {
  if (!estado.isOnline) return "reserva";
  if (estado.tilesCarregados > 0) return "tiles";
  if (estado.errosDeTile >= ERROS_ATE_A_RESERVA) return "reserva";
  return "tiles";
}

/** Anel em lat/lon, que é a ordem que o Leaflet lê (o GeoJSON vem ao contrário). */
export type AnelDoLeaflet = [number, number][];

/** O mundo inteiro, menos os polos, onde o Mercator vai ao infinito. */
export const ANEL_DO_MUNDO: AnelDoLeaflet = [
  [-89, -180],
  [-89, 180],
  [89, 180],
  [89, -180],
];

type GeometriaDaMalha = { type: string; coordinates: unknown };
type FeicaoDaMalha = { geometry?: GeometriaDaMalha | null };
type MalhaDeMunicipios = { features?: FeicaoDaMalha[] };

/** Cada tipo de geometria do GeoJSON sabe entregar os próprios anéis. */
const ANEIS_DA_GEOMETRIA: Record<string, (coordenadas: unknown) => number[][][]> = {
  Polygon: (coordenadas) => coordenadas as number[][][],
  MultiPolygon: (coordenadas) => (coordenadas as number[][][][]).flat(),
};

/** Todos os anéis da malha, de Polygon e de MultiPolygon, em [lon, lat]. */
export function readAneisDaMalha(malha: unknown): number[][][] {
  const feicoes = (malha as MalhaDeMunicipios | null)?.features ?? [];
  return feicoes.flatMap((feicao) => {
    const geometria = feicao.geometry;
    if (!geometria) return [];
    return ANEIS_DA_GEOMETRIA[geometria.type]?.(geometria.coordinates) ?? [];
  });
}

/**
 * Máscara que escurece o que está FORA do estado: um retângulo do tamanho do
 * mundo com cada município recortado como buraco. Com a regra de preenchimento
 * "evenodd" do Leaflet, municípios que só encostam um no outro não reabrem o
 * furo do vizinho, então o recorte fica com a forma do estado inteiro.
 */
export function buildMascaraDeFora(aneis: number[][][]): AnelDoLeaflet[] {
  return [ANEL_DO_MUNDO, ...readBuracosDaMalha(aneis)];
}

/** Os mesmos anéis da malha, já em lat/lon, para desenhar a grade municipal. */
export const readBuracosDaMalha = (aneis: number[][][]): AnelDoLeaflet[] =>
  aneis.map((anel) => anel.map(([lon, lat]) => [lat!, lon!] as [number, number]));

/** A aresta é a mesma nos dois sentidos: a divisa pertence aos dois vizinhos. */
const buildChaveDaAresta = (a: number[], b: number[]): string =>
  // oxlint-disable-next-line unicorn/no-array-sort
  [`${a[0]},${a[1]}`, `${b[0]},${b[1]}`].sort().join("|");

/**
 * O contorno do ESTADO, tirado da malha de municípios: aresta que aparece em um
 * município só é divisa com quem está de fora; aresta que aparece em dois é
 * divisa interna. Sai como uma lista de segmentos, que o Leaflet desenha num
 * traço só.
 *
 * Funciona porque as coordenadas do arquivo estão arredondadas em 3 casas, e
 * então a divisa compartilhada casa caractere a caractere.
 */
export function readContornoDoEstado(aneis: number[][][]): AnelDoLeaflet[] {
  const arestas = new Map<string, { vezes: number; segmento: AnelDoLeaflet }>();

  for (const anel of aneis) {
    for (let i = 0; i < anel.length - 1; i += 1) {
      const de = anel[i]!;
      const para = anel[i + 1]!;
      const chave = buildChaveDaAresta(de, para);
      const achada = arestas.get(chave);
      if (achada) {
        achada.vezes += 1;
        continue;
      }
      arestas.set(chave, {
        vezes: 1,
        segmento: [
          [de[1]!, de[0]!],
          [para[1]!, para[0]!],
        ],
      });
    }
  }

  return [...arestas.values()].filter((aresta) => aresta.vezes === 1).map((aresta) => aresta.segmento);
}
