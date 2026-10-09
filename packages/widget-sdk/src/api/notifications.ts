type NotificationType = "success" | "error" | "warning" | "info";

function emit(type: NotificationType, message: string) {
  if (typeof window === "undefined") return;
  // A plataforma escuta na mesma janela; o postMessage cobre o widget aberto num iframe.
  window.parent.postMessage({ source: "widget-sdk", event: "notification", type, message }, "*");
  window.dispatchEvent(new CustomEvent("widget:notification", { detail: { type, message } }));
}

/**
 * Avisos (toasts) mostrados pela plataforma. Dispara o evento
 * `widget:notification`. Não precisa de permissão.
 */
export const notificationsApi = {
  /**
   * Aviso de sucesso.
   * @param message Texto curto para a pessoa.
   * @example
   * notificationsApi.success("Filtro salvo.");
   */
  success: (message: string) => emit("success", message),
  /**
   * Aviso de erro.
   * @param message O que aconteceu e o que fazer.
   * @example
   * notificationsApi.error("Não foi possível carregar os chamados. Tente de novo.");
   */
  error: (message: string) => emit("error", message),
  /**
   * Aviso de atenção.
   * @param message Texto curto para a pessoa.
   * @example
   * notificationsApi.warning("Há chamados sem responsável.");
   */
  warning: (message: string) => emit("warning", message),
  /**
   * Aviso informativo.
   * @param message Texto curto para a pessoa.
   * @example
   * notificationsApi.info("Lista atualizada.");
   */
  info: (message: string) => emit("info", message),
};
