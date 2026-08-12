/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { CircularBarSpinner } from "@plane/ui";
import { cn } from "@plane/utils";

/**
 * "Consultando a IA…" — só quando a espera é perceptível.
 *
 * A consulta sai a cada pausa na digitação e costuma voltar em cerca de um
 * segundo. Mostrar o indicador imediatamente faria uma luzinha piscar sem parar
 * ao lado do campo, que é justamente o incômodo que acabamos de tirar do texto
 * fantasma. Por isso ele só aparece depois de meio segundo de espera: quem tem
 * resposta rápida nunca o vê; quem está esperando entende que o sistema não
 * travou.
 */
const ATRASO_MS = 500;

type Props = {
  consultando: boolean;
  /** `true` encolhe para só o girador, sem texto (cabe dentro de um campo). */
  compacto?: boolean;
  className?: string;
};

export const IndicadorDeConsulta = ({ consultando, compacto = false, className }: Props) => {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!consultando) {
      setVisivel(false);
      return;
    }
    const relogio = setTimeout(() => setVisivel(true), ATRASO_MS);
    return () => clearTimeout(relogio);
  }, [consultando]);

  if (!visivel) return null;

  return (
    <span
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-11 text-secondary-text", className)}
    >
      <CircularBarSpinner height="12px" width="12px" />
      {!compacto && "Consultando a IA…"}
    </span>
  );
};
