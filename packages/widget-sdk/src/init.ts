import { configureHttp } from "./http";
import { configureStorage } from "./api/storage";
import { workerItemsApi } from "./api/worker-items";
import { intakesApi } from "./api/intakes";
import { actionsApi } from "./api/actions";
import { statsApi } from "./api/stats";
import { usersApi } from "./api/users";
import { entitiesApi } from "./api/entities";
import { storageApi } from "./api/storage";
import { notificationsApi } from "./api/notifications";
import { uiApi } from "./api/ui";
import type { SDKInitOptions } from "./types";

/** O SDK inicializado, também disponível em `window.WidgetSDK`. */
export interface WidgetSDKInstance {
  /** Id do widget com que o SDK foi inicializado. */
  __widgetId: string;
  /** O mesmo que `workerItemsApi`. */
  workerItems: typeof workerItemsApi;
  /** O mesmo que `intakesApi`. */
  intakes: typeof intakesApi;
  /** O mesmo que `actionsApi`. */
  actions: typeof actionsApi;
  /** O mesmo que `statsApi`. */
  stats: typeof statsApi;
  /** O mesmo que `usersApi`. */
  users: typeof usersApi;
  /** O mesmo que `entitiesApi`. */
  entities: typeof entitiesApi;
  /** O mesmo que `storageApi`. */
  storage: typeof storageApi;
  /** O mesmo que `notificationsApi`. */
  notifications: typeof notificationsApi;
  /** O mesmo que `uiApi`. */
  ui: typeof uiApi;
}

declare global {
  interface Window {
    WidgetSDK: WidgetSDKInstance;
  }
}

/**
 * Configura o SDK: origem da plataforma, id do widget (cabeçalho X-Widget-Id)
 * e espaço aberto (`workspace_slug` de toda chamada). Na home a plataforma
 * chama por você antes de montar o widget; chame só em desenvolvimento e em
 * testes, ou fora da home.
 * @param options Origem, id do widget e espaço.
 * @returns O SDK inicializado, também gravado em `window.WidgetSDK`.
 * @example
 * initializeSDK({ baseUrl: window.location.origin, widgetId: "dev", workspaceSlug: "quality" });
 */
export function initializeSDK(options: SDKInitOptions): WidgetSDKInstance {
  configureHttp(options.baseUrl, options.widgetId, options.workspaceSlug);
  configureStorage(options.widgetId);

  const sdk: WidgetSDKInstance = {
    __widgetId: options.widgetId,
    workerItems: workerItemsApi,
    intakes: intakesApi,
    actions: actionsApi,
    stats: statsApi,
    users: usersApi,
    entities: entitiesApi,
    storage: storageApi,
    notifications: notificationsApi,
    ui: uiApi,
  };

  if (typeof window !== "undefined") {
    window.WidgetSDK = sdk;
  }

  return sdk;
}
