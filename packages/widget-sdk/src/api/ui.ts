import type { ModalConfig, DrawerConfig, ConfirmConfig } from "../types";

type UiEventPayload =
  | { event: "modal:open"; config: ModalConfig }
  | { event: "modal:close" }
  | { event: "drawer:open"; config: DrawerConfig }
  | { event: "drawer:close" }
  | { event: "confirm:open"; config: ConfirmConfig };

function emit(payload: UiEventPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("widget:ui", { detail: { source: "widget-sdk", ...payload } }));
  window.parent.postMessage({ source: "widget-sdk", ...payload }, "*");
}

/**
 * Pedidos de interface à plataforma: modal, gaveta e confirmação. Dispara o
 * evento `widget:ui`. Não precisa de permissão.
 */
export const uiApi = {
  /**
   * Abre um modal.
   * @param config Título, conteúdo e tamanho.
   * @returns `{ close }` para fechar o modal pelo widget.
   * @example
   * const modal = uiApi.modal({ title: "Detalhes", content: "Chamado SUP-42" });
   * modal.close();
   */
  modal(config: ModalConfig): { close: () => void } {
    emit({ event: "modal:open", config });
    return { close: () => emit({ event: "modal:close" }) };
  },

  /**
   * Abre uma gaveta lateral.
   * @param config Título, conteúdo e lado.
   * @returns `{ close }` para fechar a gaveta pelo widget.
   * @example
   * uiApi.drawer({ title: "Filtros", content: "...", position: "right" });
   */
  drawer(config: DrawerConfig): { close: () => void } {
    emit({ event: "drawer:open", config });
    return { close: () => emit({ event: "drawer:close" }) };
  },

  /**
   * Pede uma confirmação à pessoa.
   * @param config Pergunta, rótulos e o que fazer em cada resposta.
   * @example
   * uiApi.confirm({ title: "Limpar filtros?", message: "Os filtros salvos serão apagados.", onConfirm: () => storageApi.clear() });
   */
  confirm(config: ConfirmConfig): void {
    emit({ event: "confirm:open", config });
  },
};
