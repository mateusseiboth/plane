/**
 * O mapa de RESERVA do Mato Grosso do Sul, em SVG puro.
 *
 * É o que aparece quando os tiles do mapa colorido não chegam: a TV pode estar
 * numa rede sem saída para a internet, e um mapa de tiles ficaria cinza
 * justamente ali. Quem escolhe entre os dois é `mapa-de-ms.tsx`.
 *
 * Desenhado a partir do GeoJSON dos municípios (IBGE) que vive NO REPOSITÓRIO,
 * com `d3-geo` para a projeção.
 *
 * Cada marcador é uma cidade com entidades clientes; o número em cima é o total
 * de chamados abertos. Cor por faixa de volume, anel vermelho quando algum
 * servidor da cidade está offline e um "B" quando há backup atrasado, sempre
 * com o número junto, porque cor sozinha não informa.
 */
import { useEffect, useState } from "react";
import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import { COR_DA_FAIXA, FUNDO_DO_PAINEL, STATUS } from "../cores";
import { readFaixaDoVolume } from "../painel-helpers";
import { DISTANCIA_MINIMA_EM_GRAUS, readRaioDoMarcador, spreadPontosProximos } from "./mapa-helpers";
import type { TPontoDoMapa } from "./mapa-tv";

/**
 * Só o que o desenho precisa do GeoJSON. Tipar o arquivo inteiro exigiria o
 * pacote `geojson` como dependência para nada.
 */
type MunicipioDoMapa = { type: "Feature"; properties: { ibge: number }; geometry: unknown };
type MalhaDeMunicipios = { type: "FeatureCollection"; features: MunicipioDoMapa[] };

const LARGURA = 1000;
const ALTURA = 640;

export function MapaDeReserva({ pontos, destacado }: { pontos: TPontoDoMapa[]; destacado: string | null }) {
  const [malha, setMalha] = useState<MalhaDeMunicipios | null>(null);

  useEffect(() => {
    let vivo = true;
    // Importação dinâmica: 300 KB de contornos não precisam entrar no bundle
    // inicial do produto inteiro.
    void import("./dados/ms-municipios.geo.json").then((modulo) => {
      if (vivo) setMalha(modulo.default as unknown as MalhaDeMunicipios);
      return undefined;
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!malha)
    return <div className="text-2xl flex h-full items-center justify-center text-white/40">Carregando o mapa…</div>;

  const projecao = geoMercator().fitSize([LARGURA, ALTURA], malha as unknown as GeoPermissibleObjects);
  const caminho = geoPath(projecao);
  // As mesmas posições de desenho do mapa colorido: cidade vizinha não pode
  // sumir dentro do marcador da outra aqui também.
  const posicoes = spreadPontosProximos(pontos, DISTANCIA_MINIMA_EM_GRAUS);

  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      className="h-full w-full"
      role="img"
      aria-label="Mapa de Mato Grosso do Sul"
    >
      <g>
        {malha.features.map((municipio: MunicipioDoMapa) => (
          <path
            key={String(municipio.properties.ibge)}
            d={caminho(municipio as unknown as GeoPermissibleObjects) ?? undefined}
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth={0.8}
          />
        ))}
      </g>

      <g>
        {pontos.map((ponto) => {
          const lugar = posicoes.get(ponto.chave) ?? { lat: ponto.lat, lon: ponto.lon };
          const posicao = projecao([lugar.lon, lugar.lat]);
          if (!posicao) return null;
          const [x, y] = posicao;
          const faixa = readFaixaDoVolume(ponto.abertos);
          const offline = ponto.servidores_offline > 0;
          const emDestaque = destacado === ponto.chave;
          return (
            <g key={ponto.chave} transform={`translate(${x}, ${y})`}>
              {ponto.urgentes > 0 && (
                <circle r={readRaioDoMarcador(ponto.abertos) + 10} fill="none" stroke={STATUS.critico} strokeWidth={2}>
                  <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.6s" repeatCount="indefinite" />
                </circle>
              )}
              <circle
                r={readRaioDoMarcador(ponto.abertos)}
                fill={offline ? STATUS.critico : COR_DA_FAIXA[faixa]}
                stroke={emDestaque ? "#ffffff" : "rgba(0,0,0,0.45)"}
                strokeWidth={emDestaque ? 4 : 2}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={ponto.abertos >= 100 ? 22 : 26}
                fontWeight={700}
                fill="#0b0b0b"
              >
                {ponto.abertos}
              </text>
              {ponto.backups_atrasados > 0 && (
                <g
                  transform={`translate(${readRaioDoMarcador(ponto.abertos) - 4}, ${-readRaioDoMarcador(ponto.abertos) + 2})`}
                >
                  <circle r={11} fill={STATUS.atencao} stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} />
                  <text textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill="#0b0b0b">
                    B
                  </text>
                </g>
              )}
              {/* Contorno escuro no nome: cidades vizinhas se sobrepõem no mapa,
                  e sem ele o nome de uma some dentro do marcador da outra. */}
              <text
                y={readRaioDoMarcador(ponto.abertos) + 18}
                textAnchor="middle"
                fontSize={16}
                fill={emDestaque ? "#ffffff" : "rgba(255,255,255,0.7)"}
                fontWeight={emDestaque ? 700 : 500}
                stroke={FUNDO_DO_PAINEL}
                strokeWidth={4}
                paintOrder="stroke"
              >
                {ponto.cidade}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
