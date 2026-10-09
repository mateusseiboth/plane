// Core
export { initializeSDK } from "./init";
export type { WidgetSDKInstance } from "./init";

// Contrato com a plataforma
export { WIDGET_PERMISSIONS, WIDGET_LIMITS, WIDGET_LIFECYCLE, WIDGET_EVENTS, GATEWAY_ERRORS } from "./contrato";
export type { WidgetPermission } from "./contrato";

// APIs
export { workerItemsApi } from "./api/worker-items";
export { intakesApi } from "./api/intakes";
export { actionsApi } from "./api/actions";
export { statsApi } from "./api/stats";
export { usersApi } from "./api/users";
export { entitiesApi } from "./api/entities";
export { storageApi } from "./api/storage";
export { notificationsApi } from "./api/notifications";
export { uiApi } from "./api/ui";

// React Hooks
export {
  useWorkerItems,
  useWorkerItem,
  useIntakes,
  useIntake,
  useActions,
  useAction,
  useStats,
  useEntities,
  useEntity,
  useUsers,
  useCurrentUser,
} from "./hooks";

// Types
export type {
  PaginatedResponse,
  WorkerItem,
  WorkerItemState,
  WorkerItemFilters,
  WorkerItemStats,
  Intake,
  IntakeFilters,
  IntakeStats,
  Action,
  ActionFilters,
  ActionStats,
  StatsOverview,
  EntityStats,
  PeriodFilters,
  PeriodStats,
  User,
  UserFilters,
  Entity,
  EntityFilters,
  ModalConfig,
  DrawerConfig,
  ConfirmConfig,
  SDKInitOptions,
  WidgetSize,
  WidgetManifest,
  WidgetHomeProps,
  WidgetQueryResult,
} from "./types";
