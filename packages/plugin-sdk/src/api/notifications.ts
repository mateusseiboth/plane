type NotificationType = "success" | "error" | "warning" | "info";

function emit(type: NotificationType, message: string) {
  // Communicate with the host platform via postMessage
  if (typeof window !== "undefined") {
    window.parent.postMessage(
      { source: "plugin-sdk", event: "notification", type, message },
      "*"
    );
  }
  // Also dispatch a CustomEvent so the host can listen on the same window
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("plugin:notification", { detail: { type, message } })
    );
  }
}

export const notificationsApi = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
  warning: (message: string) => emit("warning", message),
  info: (message: string) => emit("info", message),
};
