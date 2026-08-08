/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane types
import { useTranslation } from "@plane/i18n";
import type { IUser } from "@plane/types";
// hooks
import { useCurrentTime } from "@/hooks/use-current-time";

export interface IUserGreetingsView {
  user: IUser;
  /** Frase curta com o estado do dia, ao lado da data. */
  resumo?: string;
}

/**
 * Saudação do topo da home.
 *
 * Alinhada à esquerda, junto do resto do conteúdo: centralizada no meio de uma
 * tela larga ela empurrava o conteúdo para baixo e deixava a página com cara de
 * vazia. Data e hora saem em pt-BR — em en-US virava "Friday, Aug 7" no meio de
 * uma interface toda em português.
 */
export function UserGreetingsView(props: IUserGreetingsView) {
  const { user, resumo } = props;
  const { currentTime } = useCurrentTime();
  const { t } = useTranslation();

  const hora = currentTime.getHours();
  const periodo = hora < 12 ? "morning" : hora < 18 ? "afternoon" : "evening";
  const emoji = periodo === "morning" ? "🌤️" : periodo === "afternoon" ? "🌥️" : "🌙";

  const dataLonga = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(currentTime);

  const horaTexto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: user?.user_timezone || undefined,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(currentTime);

  const nome = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.display_name;

  return (
    <div className="flex flex-col gap-0.5">
      <h1 className="text-24 font-semibold text-primary">
        {t("good")} {t(periodo)}, {nome}
      </h1>
      <p className="flex flex-wrap items-center gap-x-2 text-13 text-secondary">
        <span aria-hidden>{emoji}</span>
        <span className="first-letter:uppercase">{dataLonga}</span>
        <span className="text-tertiary">·</span>
        <span>{horaTexto}</span>
        {resumo && (
          <>
            <span className="text-tertiary">·</span>
            <span className="text-primary">{resumo}</span>
          </>
        )}
      </p>
    </div>
  );
}
