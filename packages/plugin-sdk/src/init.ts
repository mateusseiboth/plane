import { configureHttp } from "./http";
import { configureStorage } from "./api/storage";
import { configureNavigation } from "./api/navigation";
import { workerItemsApi } from "./api/worker-items";
import { intakesApi } from "./api/intakes";
import { actionsApi } from "./api/actions";
import { statsApi } from "./api/stats";
import { usersApi } from "./api/users";
import { entitiesApi } from "./api/entities";
import { storageApi } from "./api/storage";
import { notificationsApi } from "./api/notifications";
import { uiApi } from "./api/ui";
import { navigationApi } from "./api/navigation";
import { pagesApi } from "./api/pages";
import { configApi } from "./api/config";
import { permissionsApi } from "./api/permissions";
import { backendApi } from "./api/backend";
import type { SDKInitOptions } from "./types";

export interface PluginSDKInstance {
  __pluginId: string;
  workerItems: typeof workerItemsApi;
  intakes: typeof intakesApi;
  actions: typeof actionsApi;
  stats: typeof statsApi;
  users: typeof usersApi;
  entities: typeof entitiesApi;
  storage: typeof storageApi;
  notifications: typeof notificationsApi;
  ui: typeof uiApi;
  navigation: typeof navigationApi;
  pages: typeof pagesApi;
  /** G1 — per-instance plugin configuration. */
  config: typeof configApi;
  /** G2 — custom plugin permissions (RBAC). */
  permissions: typeof permissionsApi;
  /** G3 — authenticated channel to the plugin's own backend. */
  backend: typeof backendApi;
}

declare global {
  interface Window {
    PluginSDK: PluginSDKInstance;
  }
}

export function initializeSDK(options: SDKInitOptions): PluginSDKInstance {
  configureHttp(options.baseUrl, options.pluginId);
  configureStorage(options.pluginId);
  configureNavigation(options.pluginId);

  const sdk: PluginSDKInstance = {
    __pluginId: options.pluginId,
    workerItems: workerItemsApi,
    intakes: intakesApi,
    actions: actionsApi,
    stats: statsApi,
    users: usersApi,
    entities: entitiesApi,
    storage: storageApi,
    notifications: notificationsApi,
    ui: uiApi,
    navigation: navigationApi,
    pages: pagesApi,
    config: configApi,
    permissions: permissionsApi,
    backend: backendApi,
  };

  if (typeof window !== "undefined") {
    window.PluginSDK = sdk;
  }

  return sdk;
}
