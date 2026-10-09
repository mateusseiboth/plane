/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { CartaoDoPainel } from "@/components/home/painel/cartao";
import { DynamicWidget } from "@/components/widgets/dynamic-widget";
import { buildChaveDeInstalado, readIdDeInstalado, readManifestoDaHome } from "@/components/home/grade/grade-rules";
import type { TPropsDoWidget, TWidgetDaHome } from "@/components/home/grade/tipos";
// hooks
import { useWidgetsInstalados } from "@/hooks/use-widgets-instalados";
// services
import type { IWidget } from "@/services/widget.service";

/**
 * Cartão de um widget do marketplace: a mesma casca dos nativos, com o pacote
 * carregado dentro. O componente é um só para todos os instalados (identidade
 * estável: trocar de lugar não recarrega o pacote); o widget sai da chave.
 */
function WidgetInstalado({ chave, tamanho }: TPropsDoWidget) {
  const id = readIdDeInstalado(chave) ?? "";
  const { data } = useWidgetsInstalados();
  const widget = data?.find((instalado) => instalado.id === id);
  const { titulo } = readManifestoDaHome(widget?.manifest, widget?.name ?? "Widget");

  return (
    <CartaoDoPainel titulo={titulo} subtitulo={widget && `${widget.author} · v${widget.version}`}>
      <DynamicWidget widgetId={id} props={{ size: tamanho }} />
    </CartaoDoPainel>
  );
}

const ORIGEM_PELO_ESCOPO: Record<IWidget["scope"], TWidgetDaHome["origem"]> = { global: "instalado", user: "meu" };

/** Um widget instalado vira uma entrada do catálogo com o mesmo contrato dos nativos. */
export const buildWidgetInstalado = (widget: IWidget): TWidgetDaHome => {
  const { titulo, tamanhoPadrao } = readManifestoDaHome(widget.manifest, widget.name);
  return {
    chave: buildChaveDeInstalado(widget.id),
    titulo,
    descricao: widget.description ?? `Widget de ${widget.author}.`,
    tamanhoPadrao,
    origem: ORIGEM_PELO_ESCOPO[widget.scope] ?? "instalado",
    componente: WidgetInstalado,
  };
};
