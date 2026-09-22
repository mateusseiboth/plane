/**
 * A cena da abertura: um lado de aeródromo visto de perfil, em SVG puro.
 *
 * Coordenadas: viewBox 1600×900 com `slice`, para preencher qualquer tela.
 * O chão fica em y=700 e o avião está ancorado em (480, 700), com o trem de
 * pouso tocando a linha do chão. As camadas de paisagem desenham o tile duas
 * vezes (x=0 e x=1600) e rolam um tile por volta (ver `styles/abertura.css`).
 *
 * A pista ocupa o trecho 216..1016 do tile do chão: são os 44% do ciclo em que
 * o avião está no solo (pouso do ciclo anterior + corrida do seguinte), já com
 * folga na cabeceira. Mexeu nos percentuais da coreografia, mexa aqui também.
 */

const LARGURA_DO_TILE = 1600;
const CHAO = 700;
const AVIAO_X = 480;
/** A coreografia (em px) e a sombra escalam junto: o avião cruza mais alto. */
const ESCALA_DO_AVIAO = 1.2;

const ESTRELAS: ReadonlyArray<readonly [number, number, number]> = [
  [90, 80, 2],
  [210, 160, 1.5],
  [330, 60, 2.2],
  [470, 210, 1.4],
  [560, 110, 1.8],
  [690, 40, 1.5],
  [760, 250, 2],
  [880, 140, 1.4],
  [990, 70, 2.1],
  [1080, 220, 1.6],
  [1180, 40, 1.3],
  [1420, 100, 1.8],
  [1500, 260, 1.5],
  [1560, 40, 2],
  [150, 300, 1.3],
  [400, 330, 1.6],
  [650, 320, 1.2],
  [930, 340, 1.7],
  [1250, 320, 1.4],
  [1350, 200, 2.2],
];

const PINHEIROS_DO_CHAO: ReadonlyArray<readonly [number, number]> = [
  [40, 1.1],
  [110, 0.8],
  [170, 1.25],
  [1090, 0.9],
  [1160, 1.2],
  [1250, 0.85],
  [1470, 1.05],
  [1560, 0.8],
];

const ARVORES_REDONDAS_DO_CHAO: ReadonlyArray<readonly [number, number]> = [
  [75, 0.9],
  [1125, 1],
  [1210, 0.8],
  [1520, 0.95],
];

const PINHEIROS_DAS_COLINAS: ReadonlyArray<readonly [number, number, number]> = [
  [120, 618, 0.55],
  [160, 612, 0.7],
  [470, 640, 0.5],
  [520, 636, 0.62],
  [880, 626, 0.6],
  [930, 622, 0.5],
  [1240, 632, 0.65],
  [1290, 628, 0.5],
  [1330, 636, 0.6],
];

const NUVENS: ReadonlyArray<readonly [number, number, number]> = [
  [180, 190, 1],
  [640, 120, 0.8],
  [1050, 230, 1.15],
  [1420, 130, 0.7],
];

const Pinheiro = () => (
  <g>
    <rect className="abertura__tronco" x="-5" y="-22" width="10" height="24" rx="2" />
    <path className="abertura__copa" d="M0 -110 L34 -58 H-34 Z" />
    <path className="abertura__copa-clara" d="M0 -88 L40 -38 H-40 Z" />
    <path className="abertura__copa" d="M0 -66 L46 -18 H-46 Z" />
  </g>
);

const ArvoreRedonda = () => (
  <g>
    <rect className="abertura__tronco" x="-6" y="-38" width="12" height="40" rx="3" />
    <circle className="abertura__copa" cx="-14" cy="-52" r="22" />
    <circle className="abertura__copa" cx="16" cy="-56" r="24" />
    <circle className="abertura__copa-clara" cx="0" cy="-70" r="26" />
  </g>
);

const Nuvem = () => (
  <g className="abertura__nuvem">
    <ellipse cx="0" cy="0" rx="70" ry="26" />
    <ellipse cx="-38" cy="6" rx="42" ry="20" />
    <ellipse cx="40" cy="4" rx="46" ry="22" />
    <ellipse cx="6" cy="-18" rx="40" ry="24" />
  </g>
);

const Montanhas = () => (
  <g>
    <path
      className="abertura__montanha"
      d={`M0 ${CHAO} L110 540 L230 610 L370 450 L500 600 L630 520 L790 400 L950 580 L1070 500 L1200 600 L1330 460 L1470 590 L1600 ${CHAO} Z`}
    />
    <path className="abertura__neve" d="M370 450 L398 486 L384 480 L370 492 L356 480 L342 486 Z" />
    <path className="abertura__neve" d="M790 400 L822 444 L806 436 L790 450 L774 436 L758 444 Z" />
    <path className="abertura__neve" d="M1330 460 L1356 494 L1342 488 L1330 500 L1318 488 L1304 494 Z" />
  </g>
);

const Colinas = () => (
  <g>
    <path
      className="abertura__colina"
      d={`M0 ${CHAO} C140 600 320 590 460 660 C560 710 660 690 760 640 C880 580 1020 590 1140 660 C1260 728 1380 700 1500 660 C1540 646 1580 680 1600 ${CHAO} L1600 900 L0 900 Z`}
    />
    {PINHEIROS_DAS_COLINAS.map(([x, y, escala]) => (
      <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${escala})`}>
        <Pinheiro />
      </g>
    ))}
  </g>
);

const Pista = () => (
  <g>
    <rect className="abertura__grama-escura" x="216" y={CHAO - 8} width="800" height="6" rx="3" />
    <rect className="abertura__pista" x="216" y={CHAO - 6} width="800" height="20" rx="4" />
    <line
      className="abertura__pista-faixa"
      x1="250"
      y1={CHAO + 4}
      x2="982"
      y2={CHAO + 4}
      strokeWidth="3"
      strokeDasharray="26 22"
      strokeLinecap="round"
      opacity="0.85"
    />
    {[224, 234, 244, 254, 264].map((x) => (
      <rect key={`e-${x}`} className="abertura__pista-faixa" x={x} y={CHAO - 2} width="5" height="12" rx="1" />
    ))}
    {[964, 974, 984, 994, 1004].map((x) => (
      <rect key={`d-${x}`} className="abertura__pista-faixa" x={x} y={CHAO - 2} width="5" height="12" rx="1" />
    ))}
  </g>
);

const Hangar = () => (
  <g>
    <rect className="abertura__predio-sombra" x="1310" y="640" width="130" height="60" />
    <path className="abertura__predio" d="M1300 642 Q1375 590 1450 642 Z" />
    <rect className="abertura__predio" x="1318" y="646" width="114" height="54" />
    <rect className="abertura__pista" x="1350" y="662" width="50" height="38" rx="2" />
    <rect className="abertura__predio-sombra" x="1120" y="620" width="18" height="80" />
    <rect className="abertura__predio" x="1106" y="604" width="46" height="26" rx="4" />
    <rect className="abertura__janela" x="1112" y="610" width="34" height="10" rx="2" />
  </g>
);

const Chao = () => (
  <g>
    <rect className="abertura__grama" x="0" y={CHAO} width={LARGURA_DO_TILE} height="200" />
    <path
      className="abertura__grama-escura"
      d={`M0 ${CHAO + 40} Q200 ${CHAO + 20} 420 ${CHAO + 46} T860 ${CHAO + 36} T1300 ${CHAO + 50} T1600 ${CHAO + 40} L1600 900 L0 900 Z`}
      opacity="0.35"
    />
    <Hangar />
    <Pista />
    {ARVORES_REDONDAS_DO_CHAO.map(([x, escala]) => (
      <g key={`r-${x}`} transform={`translate(${x} ${CHAO}) scale(${escala})`}>
        <ArvoreRedonda />
      </g>
    ))}
    {PINHEIROS_DO_CHAO.map(([x, escala]) => (
      <g key={`p-${x}`} transform={`translate(${x} ${CHAO}) scale(${escala})`}>
        <Pinheiro />
      </g>
    ))}
  </g>
);

/** Desenha o tile duas vezes: a camada rola um tile e a emenda some. */
const Camada = ({ id, classe, children }: { id: string; classe: string; children: React.ReactNode }) => (
  <g className={`abertura__camada ${classe}`}>
    <g id={id}>{children}</g>
    <use href={`#${id}`} x={LARGURA_DO_TILE} />
  </g>
);

/**
 * Avião de perfil, nariz para a direita, com o trem tocando y=0.
 * Fuselagem branca com a cauda e a faixa na marca.
 */
const Aviao = () => (
  <g className="abertura__aviao">
    {/* Rastro: só em voo. */}
    <path
      className="abertura__rastro"
      d="M-96 -34 H-330"
      stroke="url(#abertura-rastro)"
      strokeWidth="6"
      strokeLinecap="round"
      fill="none"
    />
    {/* Trem de pouso. */}
    <g className="abertura__trem">
      <line x1="-22" y1="-22" x2="-22" y2="-6" strokeWidth="4" />
      <circle cx="-22" cy="-5" r="6" />
      <line x1="56" y1="-22" x2="56" y2="-6" strokeWidth="4" />
      <circle cx="56" cy="-5" r="6" />
    </g>
    {/* Estabilizador horizontal e deriva (cauda com a marca). */}
    <path className="abertura__fuselagem-sombra" d="M-62 -34 L-100 -46 L-92 -32 Z" />
    <path fill="url(#abertura-marca)" d="M-60 -46 L-84 -92 L-62 -92 L-30 -46 Z" />
    {/* Asa (para o observador, um pouco abaixo do meio da fuselagem). */}
    <path className="abertura__fuselagem-sombra" d="M-6 -36 L-56 -8 L-12 -8 L30 -36 Z" />
    {/* Motor sob a asa. */}
    <rect className="abertura__fuselagem-sombra" x="-14" y="-24" width="40" height="16" rx="8" />
    <rect fill="url(#abertura-marca)" x="-14" y="-24" width="8" height="16" rx="4" />
    {/* Fuselagem. */}
    <path
      className="abertura__fuselagem"
      d="M-82 -48 H50 C76 -48 92 -40 98 -33 C92 -26 76 -20 50 -20 H-64 C-76 -20 -84 -30 -82 -48 Z"
    />
    <path
      className="abertura__fuselagem-sombra"
      d="M-64 -20 H50 C70 -20 84 -24 92 -30 C84 -27 70 -26 50 -26 H-64 Z"
      opacity="0.7"
    />
    {/* Faixa da marca ao longo da fuselagem. */}
    <path
      fill="url(#abertura-marca)"
      d="M-80 -30 H60 C70 -30 78 -29 84 -28 C78 -27 70 -26 60 -26 H-66 C-72 -26 -78 -28 -80 -30 Z"
    />
    {/* Janelas e cabine. */}
    <path className="abertura__janela" d="M62 -46 L82 -46 L92 -38 L64 -38 Z" />
    {[-56, -42, -28, -14, 0, 14, 28, 42].map((x) => (
      <circle key={x} className="abertura__janela" cx={x} cy="-38" r="3" />
    ))}
  </g>
);

export function Cena() {
  return (
    <svg
      className="abertura__cena"
      viewBox={`0 0 ${LARGURA_DO_TILE} 900`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="abertura-ceu" x1="0" y1="0" x2="0" y2="1">
          <stop className="abertura__ceu-alto" offset="0" />
          <stop className="abertura__ceu-baixo" offset="1" />
        </linearGradient>
        <linearGradient id="abertura-marca" x1="0" y1="1" x2="1" y2="0">
          <stop className="abertura__marca-a" offset="0" />
          <stop className="abertura__marca-b" offset="1" />
        </linearGradient>
        {/* Em linha reta o gradiente precisa de coordenadas absolutas: a caixa
            de uma linha horizontal tem altura zero e o gradiente some. */}
        <linearGradient id="abertura-rastro" gradientUnits="userSpaceOnUse" x1="-96" y1="0" x2="-330" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="abertura-halo">
          <stop className="abertura__halo-centro" offset="0.5" />
          <stop className="abertura__halo-borda" offset="1" />
        </radialGradient>
      </defs>

      <rect width={LARGURA_DO_TILE} height="900" fill="url(#abertura-ceu)" />

      <g className="abertura__estrelas">
        {ESTRELAS.map(([x, y, r], i) => (
          <circle key={`${x}-${y}`} className={i % 2 ? "abertura__estrela--pisca" : undefined} cx={x} cy={y} r={r} />
        ))}
      </g>

      <g transform="translate(1250 170)">
        <circle fill="url(#abertura-halo)" r="130" />
        <circle className="abertura__astro" r="64" />
        <circle className="abertura__lua-sombra" cx="26" cy="-14" r="52" />
      </g>

      <Camada id="abertura-tile-nuvens" classe="abertura__camada--nuvens">
        {NUVENS.map(([x, y, escala]) => (
          <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${escala})`}>
            <Nuvem />
          </g>
        ))}
      </Camada>

      <Camada id="abertura-tile-montanhas" classe="abertura__camada--montanhas">
        <Montanhas />
      </Camada>

      <Camada id="abertura-tile-colinas" classe="abertura__camada--colinas">
        <Colinas />
      </Camada>

      <Camada id="abertura-tile-chao" classe="abertura__camada--chao">
        <Chao />
      </Camada>

      <ellipse className="abertura__sombra" cx={AVIAO_X} cy={CHAO + 6} rx="115" ry="7" />

      <g transform={`translate(${AVIAO_X} ${CHAO}) scale(${ESCALA_DO_AVIAO})`}>
        <Aviao />
      </g>
    </svg>
  );
}
