/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import useSWR from "swr";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { WIDGETS_NATIVOS } from "@/components/home/grade/catalogo";
import {
  buildLayoutPadrao,
  mergeLayout,
  readIdDeInstalado,
  toPreferencias,
  type TItemDaGrade,
  type TPreferenciaDeWidget,
} from "@/components/home/grade/grade-rules";
import type { TWidgetDaHome } from "@/components/home/grade/tipos";
import { buildWidgetInstalado } from "@/components/home/grade/widget-instalado";
// services
import { homeWidgetsService } from "@/services/home-widgets.service";
// hooks
import { useWidgetsInstalados } from "@/hooks/use-widgets-instalados";

const SWR_OPTIONS = { revalidateOnFocus: false } as const;
const SEM_PREFERENCIAS: TPreferenciaDeWidget[] = [];

/** O que a pessoa salvou; sem nada salvo (ou se a leitura falhar) vale o layout padrão. */
function usePreferenciasDaHome(slug: string | undefined) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    slug ? `HOME_WIDGETS_${slug}` : null,
    () => homeWidgetsService.read(slug!),
    SWR_OPTIONS
  );
  return { data, error, isLoading, isFetching: isValidating, mutate };
}

/** Preferências de instalados que não estão no catálogo porque a lista do marketplace não carregou. */
const readOrfas = (salvos: TPreferenciaDeWidget[], catalogo: TWidgetDaHome[], semInstalados: boolean) =>
  semInstalados
    ? salvos.filter((salvo) => readIdDeInstalado(salvo.chave) && !catalogo.some((w) => w.chave === salvo.chave))
    : [];

/**
 * Grade de widgets da home: catálogo (nativos + instalados), layout da pessoa
 * e a gravação. Toda mudança aparece na hora e é salva em seguida; se a API
 * recusar, a grade volta ao que estava.
 */
export function useGradeDaHome(slug: string | undefined) {
  const preferencias = usePreferenciasDaHome(slug);
  const instalados = useWidgetsInstalados();

  const catalogo = useMemo(
    () => [...WIDGETS_NATIVOS, ...(instalados.data ?? []).map(buildWidgetInstalado)],
    [instalados.data]
  );
  const salvos = preferencias.data?.widgets ?? SEM_PREFERENCIAS;
  const layout = useMemo(() => mergeLayout(catalogo, salvos), [catalogo, salvos]);
  const widgetPorChave = useMemo(() => new Map(catalogo.map((widget) => [widget.chave, widget])), [catalogo]);
  const orfas = readOrfas(salvos, catalogo, Boolean(instalados.error));

  const saveLayout = async (novo: TItemDaGrade[]) => {
    if (!slug) return;
    const widgets = toPreferencias(novo, orfas);
    try {
      await preferencias.mutate(homeWidgetsService.save(slug, widgets), {
        optimisticData: { widgets },
        rollbackOnError: true,
        populateCache: true,
        revalidate: false,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Não foi possível salvar a home",
        message: "A organização anterior foi mantida. Tente de novo.",
      });
    }
  };

  return {
    catalogo,
    layout,
    widgetPorChave,
    isLoading: preferencias.isLoading || instalados.isLoading,
    isFetching: preferencias.isFetching || instalados.isFetching,
    error: preferencias.error ?? instalados.error,
    saveLayout,
    restoreLayoutPadrao: () => saveLayout(buildLayoutPadrao(catalogo)),
  };
}

export type TGradeDaHome = ReturnType<typeof useGradeDaHome>;
