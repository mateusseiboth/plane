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

export interface WidgetSDKInstance {
  __widgetId: string;
  workerItems: typeof workerItemsApi;
  intakes: typeof intakesApi;
  actions: typeof actionsApi;
  stats: typeof statsApi;
  users: typeof usersApi;
  entities: typeof entitiesApi;
  storage: typeof storageApi;
  notifications: typeof notificationsApi;
  ui: typeof uiApi;
}

declare global {
  interface Window {
    WidgetSDK: WidgetSDKInstance;
  }
}

export function initializeSDK(options: SDKInitOptions): WidgetSDKInstance {
  configureHttp(options.baseUrl, options.widgetId);
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
