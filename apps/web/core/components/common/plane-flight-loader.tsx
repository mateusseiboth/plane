/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Tela de carregamento: o avião decola à esquerda, cruza a tela e volta para
 * pousar no mesmo ponto — o ciclo é contínuo, sem "teletransporte".
 *
 * O SVG é inline (e não um <img>) porque a animação precisa começar no primeiro
 * paint: esta tela existe justamente enquanto a aplicação ainda não hidratou, e
 * um asset externo poderia chegar depois. As keyframes ficam em
 * `styles/plane-loader.css`.
 */

type Props = {
  /** Texto opcional (ex.: "Carregando seus chamados…"). */
  label?: string;
};

export function PlaneFlightLoader({ label }: Props) {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-canvas">
      {/* Pista: a linha por onde o avião decola e pousa. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 flex items-center">
        <svg className="w-full" height="2" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 2">
          <line
            className="aviao-loader__route text-tertiary/40"
            x1="0"
            y1="1"
            x2="100"
            y2="1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* O avião fica ancorado na pista; a animação move o conjunto. */}
      <div className="absolute inset-x-0 top-1/2" aria-hidden="true">
        <div className="aviao-loader__track flex -translate-y-1/2 items-center" role="status" aria-label="Carregando">
          <span
            className="aviao-loader__trail mr-1 h-[3px] w-24 rounded-full bg-gradient-to-r from-transparent to-[#2BA6E0]/70 sm:w-40"
            aria-hidden="true"
          />
          {/* A marca aponta para nordeste; girar o ELEMENTO em 45° a deixa
              apontando para a direita. Rotacionar por dentro do SVG mudaria a
              caixa do desenho e o viewBox (calculado para 45°) cortava o nariz. */}
          <svg
            width="48"
            height="48"
            viewBox="8.6 9.1 46.1 46.1"
            aria-hidden="true"
            className="rotate-45 drop-shadow-sm"
          >
            <defs>
              <linearGradient id="aviaoLoaderBody" x1="14" y1="52" x2="52" y2="12" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#12315F" />
                <stop offset="1" stopColor="#2BA6E0" />
              </linearGradient>
            </defs>
            <g transform="rotate(45 36 28) translate(2 -1) scale(0.94)">
              <path
                fill="url(#aviaoLoaderBody)"
                d="M36 4c2.6 0 4.6 3.1 5.1 7.4L42 24.5l19.5 13.6c.9.6 1.5 1.7 1.5 2.8v3.4c0 .9-.9 1.6-1.8 1.3L42 39.4v8.2l6.6 5.6c.6.5.9 1.2.9 2v2.3c0 .8-.8 1.4-1.6 1.2L36 55.4l-11.9 3.3c-.8.2-1.6-.4-1.6-1.2v-2.3c0-.8.3-1.5.9-2l6.6-5.6v-8.2l-19.2 6.2c-.9.3-1.8-.4-1.8-1.3v-3.4c0-1.1.6-2.2 1.5-2.8L30 24.5l.9-13.1C31.4 7.1 33.4 4 36 4z"
              />
            </g>
          </svg>
        </div>
      </div>

      {label && <p className="absolute bottom-1/3 text-sm text-secondary">{label}</p>}
    </div>
  );
}
