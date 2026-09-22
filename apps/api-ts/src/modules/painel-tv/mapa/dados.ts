/**
 * Os dados estáticos do painel do mapa, num lugar só.
 *
 * - `municipios-ms.json`: os 79 municípios de MS (IBGE), com a coordenada da
 *   sede. É o que casa a cidade da entidade com um ponto do mapa.
 * - `entidades-legado.json`: por entidade migrada do SAC, o código dela no SAC
 *   desktop e o endereço gravado no monitor de servidores. Gerado por
 *   `scripts/gerar-coordenadas-das-entidades.ts`.
 *
 * São ARQUIVOS no repositório de propósito: a TV pode estar numa rede sem saída
 * para a internet, e cidade não muda de lugar.
 */

import entidadesLegado from "@modules/painel-tv/mapa/dados/entidades-legado.json";
import municipiosMs from "@modules/painel-tv/mapa/dados/municipios-ms.json";
import type { CoordenadasPorEntidade, Municipio } from "@modules/painel-tv/mapa/mapa";

export const readMunicipiosDeMs = (): Municipio[] => municipiosMs as Municipio[];

export const readEntidadesLegado = (): CoordenadasPorEntidade => entidadesLegado as CoordenadasPorEntidade;
