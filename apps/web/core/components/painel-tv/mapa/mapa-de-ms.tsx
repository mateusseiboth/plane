/**
 * O mapa de Mato Grosso do Sul do painel de TV, com Leaflet.
 *
 * A base é o **Esri World Topo Map**: mapa de terreno colorido, com rios,
 * sombreamento de relevo e vegetação. Numa TV, de longe, é o que dá ao painel
 * cara de mapa de verdade; um mapa só de ruas fica branco e vazio no interior
 * de MS, e o desenho chapado anterior não dizia nada sobre a região. O tile é
 * escurecido por CSS para conviver com o painel escuro (ver `mapa-do-painel.css`).
 *
 * O que está FORA do estado fica escurecido por uma máscara, e o contorno de MS
 * é traçado por cima: o estado salta, e o resto continua servindo de referência.
 *
 * Sem internet, os tiles não chegam e a TV ficaria com um retângulo cinza. Por
 * isso o componente vigia `tileerror`, o relógio e `navigator.onLine`, e cai
 * para `MapaDeReserva` (SVG do GeoJSON versionado) quando o mapa não vem.
 *
 * Atribuição do provedor é obrigatória e fica no canto, pelo controle do Leaflet.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as L from "leaflet";
// Folha de estilo é efeito colateral por natureza: não há o que atribuir.
/* oxlint-disable-next-line import/no-unassigned-import */
import "leaflet/dist/leaflet.css";
/* oxlint-disable-next-line import/no-unassigned-import */
import "./mapa-do-painel.css";
import { COR_DA_FAIXA, FUNDO_DO_PAINEL, STATUS } from "../cores";
import { readFaixaDoVolume } from "../painel-helpers";
import { MapaDeReserva } from "./mapa-de-reserva";
import {
  DISTANCIA_MINIMA_EM_GRAUS,
  ERROS_ATE_A_RESERVA,
  buildMascaraDeFora,
  readAneisDaMalha,
  readBuracosDaMalha,
  readContornoDoEstado,
  readFonteDoMapa,
  readRaioDoMarcador,
  spreadPontosProximos,
  type EstadoDosTiles,
} from "./mapa-helpers";
import type { TPontoDoMapa } from "./mapa-tv";

const TERRENO = {
  url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  atribuicao: "Esri, USGS, NOAA",
  zoomMaximo: 14,
};

/** Folga em volta do estado: o mapa não passeia para fora de MS. */
const FOLGA_DOS_LIMITES = 0.12;

/** Tile que não chega em 8 s é rede sem saída, não lentidão. */
const ESPERA_PELOS_TILES_MS = 8_000;

const TILES_NO_COMECO: EstadoDosTiles = { isOnline: true, tilesCarregados: 0, errosDeTile: 0 };

type Props = { pontos: TPontoDoMapa[]; destacado: string | null };

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/** O nome da entidade é texto de cadastro e entra em HTML cru do `divIcon`. */
const escapeHtml = (texto: string): string => texto.replace(/[&<>"]/g, (caractere) => ESCAPES[caractere]!);

const corDoPonto = (ponto: TPontoDoMapa): string =>
  ponto.servidores_offline > 0 ? STATUS.critico : COR_DA_FAIXA[readFaixaDoVolume(ponto.abertos)];

/** O marcador é HTML: o Leaflet só sabe injetar string no `divIcon`. */
function buildHtmlDoMarcador(ponto: TPontoDoMapa, emDestaque: boolean): string {
  const raio = readRaioDoMarcador(ponto.abertos);
  const estilo = [
    `--diametro:${raio * 2}px`,
    `--cor:${corDoPonto(ponto)}`,
    `--cor-critica:${STATUS.critico}`,
    `--cor-de-atencao:${STATUS.atencao}`,
    `--tamanho-do-numero:${ponto.abertos >= 100 ? "1.15rem" : "1.4rem"}`,
  ].join(";");

  return [
    `<div class="marcador-do-mapa${emDestaque ? " marcador-do-mapa--destaque" : ""}" style="${estilo}">`,
    ponto.urgentes > 0 ? `<span class="marcador-do-mapa__pulso"></span>` : "",
    `<span class="marcador-do-mapa__bolha">${ponto.abertos}</span>`,
    ponto.backups_atrasados > 0 ? `<span class="marcador-do-mapa__selo">B</span>` : "",
    `<span class="marcador-do-mapa__rotulo">${escapeHtml(ponto.cidade)}</span>`,
    `</div>`,
  ].join("");
}

const AVISOS_DA_ENTIDADE: { when: (e: TPontoDoMapa["entidades"][number]) => boolean; texto: string; cor: string }[] = [
  { when: (e) => e.servidor === "offline", texto: "servidor offline", cor: STATUS.critico },
  { when: (e) => e.backup_atrasado, texto: "backup atrasado", cor: STATUS.atencao },
];

const buildAvisosDaEntidade = (entidade: TPontoDoMapa["entidades"][number]): string =>
  AVISOS_DA_ENTIDADE.filter((aviso) => aviso.when(entidade))
    .map((aviso) => ` <b style="color:${aviso.cor}">${aviso.texto}</b>`)
    .join("");

/** Cartão de detalhe da cidade, entidade por entidade. */
function buildHtmlDoCartao(ponto: TPontoDoMapa): string {
  const linhas = ponto.entidades
    .slice(0, 6)
    .map(
      (entidade) =>
        `<div class="cartao-do-mapa__linha">${entidade.abertos} ${escapeHtml(entidade.nome)}${buildAvisosDaEntidade(entidade)}</div>`
    )
    .join("");
  return `<div class="cartao-do-mapa__titulo">${escapeHtml(`${ponto.cidade}/${ponto.uf}`)}</div>${linhas}`;
}

function MapaComTerreno({
  pontos,
  destacado,
  onTileCarregado,
  onTileComErro,
}: Props & { onTileCarregado: () => void; onTileComErro: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const marcadores = useRef<L.LayerGroup | null>(null);
  const limitesDoEstado = useRef<L.LatLngBounds | null>(null);
  const [isDesenhado, setDesenhado] = useState(false);

  useEffect(() => {
    const no = caixa.current;
    if (!no) return undefined;
    let vivo = true;

    const enquadrar = (alvo: L.Map) => {
      const limites = limitesDoEstado.current;
      if (!limites) return;
      alvo.fitBounds(limites, { padding: [12, 12], animate: false });
    };

    const mapa = L.map(no, {
      // A TV não tem ponteiro nem teclado: tudo o que o Leaflet oferece de
      // interação só serviria para a tela sair do lugar e ninguém devolver.
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0.1,
      maxBoundsViscosity: 1,
      center: [-20.5, -54.6],
      zoom: 6,
    });

    const terreno = L.tileLayer(TERRENO.url, {
      attribution: TERRENO.atribuicao,
      maxZoom: TERRENO.zoomMaximo,
      keepBuffer: 4,
    });
    terreno.on("tileload", onTileCarregado);
    terreno.on("tileerror", onTileComErro);
    terreno.addTo(mapa);

    marcadores.current = L.layerGroup().addTo(mapa);

    void import("./dados/ms-municipios.geo.json").then((modulo) => {
      if (!vivo) return undefined;
      const aneis = readAneisDaMalha(modulo.default);

      L.polygon(buildMascaraDeFora(aneis), {
        stroke: false,
        fillColor: FUNDO_DO_PAINEL,
        fillOpacity: 0.78,
        interactive: false,
      }).addTo(mapa);

      // A grade municipal dá textura e ajuda a situar a cidade sem ler o nome.
      L.polyline(readBuracosDaMalha(aneis), {
        color: "#ffffff",
        weight: 0.5,
        opacity: 0.16,
        interactive: false,
      }).addTo(mapa);

      const contorno = L.polyline(readContornoDoEstado(aneis), {
        color: "#ffffff",
        weight: 2,
        opacity: 0.7,
        interactive: false,
      }).addTo(mapa);

      limitesDoEstado.current = contorno.getBounds();
      mapa.setMaxBounds(limitesDoEstado.current.pad(FOLGA_DOS_LIMITES));
      enquadrar(mapa);
      setDesenhado(true);
      return undefined;
    });

    // O painel nasce dentro de um flex e pode medir zero quando o mapa é
    // criado: reenquadrar a cada medida nova evita a TV abrir com o estado
    // cortado ou perdido no canto.
    const observador = new ResizeObserver(() => {
      mapa.invalidateSize();
      enquadrar(mapa);
    });
    observador.observe(no);

    return () => {
      vivo = false;
      observador.disconnect();
      marcadores.current = null;
      mapa.remove();
    };
  }, [onTileCarregado, onTileComErro]);

  useEffect(() => {
    const camada = marcadores.current;
    if (!camada) return;
    camada.clearLayers();

    const posicoes = spreadPontosProximos(pontos, DISTANCIA_MINIMA_EM_GRAUS);
    for (const ponto of pontos) {
      const lugar = posicoes.get(ponto.chave) ?? { lat: ponto.lat, lon: ponto.lon };
      const raio = readRaioDoMarcador(ponto.abertos);
      L.marker([lugar.lat, lugar.lon], {
        icon: L.divIcon({
          className: "",
          html: buildHtmlDoMarcador(ponto, destacado === ponto.chave),
          iconSize: [raio * 2, raio * 2],
          iconAnchor: [raio, raio],
        }),
        keyboard: false,
        riseOnHover: true,
        title: `${ponto.cidade}: ${ponto.abertos} chamado(s) aberto(s)`,
      })
        .bindTooltip(buildHtmlDoCartao(ponto), {
          className: "cartao-do-mapa",
          direction: "top",
          offset: [0, -raio],
        })
        .addTo(camada);
    }
  }, [pontos, destacado, isDesenhado]);

  return <div ref={caixa} className="mapa-do-painel" role="img" aria-label="Mapa de Mato Grosso do Sul" />;
}

/**
 * Escolhe entre o mapa de terreno e o desenho de reserva, e não volta atrás
 * sozinho: uma TV que ficasse trocando de mapa a cada tile perdido cansaria
 * mais que um mapa simples.
 */
export function MapaDeMs({ pontos, destacado }: Props) {
  const [tiles, setTiles] = useState<EstadoDosTiles>(() => ({
    ...TILES_NO_COMECO,
    isOnline: typeof navigator === "undefined" || navigator.onLine !== false,
  }));

  const onTileCarregado = useCallback(
    () => setTiles((atual) => (atual.tilesCarregados > 0 ? atual : { ...atual, tilesCarregados: 1 })),
    []
  );

  const onTileComErro = useCallback(
    () =>
      setTiles((atual) =>
        atual.errosDeTile >= ERROS_ATE_A_RESERVA ? atual : { ...atual, errosDeTile: atual.errosDeTile + 1 }
      ),
    []
  );

  useEffect(() => {
    const ligou = () => setTiles({ ...TILES_NO_COMECO, isOnline: true });
    const caiu = () => setTiles((atual) => ({ ...atual, isOnline: false }));
    window.addEventListener("online", ligou);
    window.addEventListener("offline", caiu);
    return () => {
      window.removeEventListener("online", ligou);
      window.removeEventListener("offline", caiu);
    };
  }, []);

  // Rede que engole o pedido em silêncio não dispara `tileerror`: sem este
  // relógio, a TV ficaria para sempre num retângulo vazio esperando o mapa.
  useEffect(() => {
    const relogio = setTimeout(
      () => setTiles((atual) => (atual.tilesCarregados > 0 ? atual : { ...atual, errosDeTile: ERROS_ATE_A_RESERVA })),
      ESPERA_PELOS_TILES_MS
    );
    return () => clearTimeout(relogio);
  }, []);

  if (readFonteDoMapa(tiles) === "reserva") return <MapaDeReserva pontos={pontos} destacado={destacado} />;
  return (
    <MapaComTerreno
      pontos={pontos}
      destacado={destacado}
      onTileCarregado={onTileCarregado}
      onTileComErro={onTileComErro}
    />
  );
}
