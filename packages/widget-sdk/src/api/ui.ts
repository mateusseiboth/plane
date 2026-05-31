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

export const uiApi = {
  modal(config: ModalConfig) {
    emit({ event: "modal:open", config });
    return { close: () => emit({ event: "modal:close" }) };
  },

  drawer(config: DrawerConfig) {
    emit({ event: "drawer:open", config });
    return { close: () => emit({ event: "drawer:close" }) };
  },

  confirm(config: ConfirmConfig) {
    emit({ event: "confirm:open", config });
  },
};
