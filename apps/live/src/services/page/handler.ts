/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AppError } from "@/lib/errors";
import type { HocusPocusServerContext, TDocumentTypes } from "@/types";
// services
import type { PageService } from "./extended.service";
import { ProjectPageService } from "./project-page.service";
import { WorkspacePageService } from "./workspace-page.service";

/** Um serviço por tipo de documento: tipo novo é uma linha aqui. */
const PAGE_SERVICE_FACTORIES: Record<TDocumentTypes, (context: HocusPocusServerContext) => PageService> = {
  project_page: (context) =>
    new ProjectPageService({
      workspaceSlug: context.workspaceSlug,
      projectId: context.projectId,
      cookie: context.cookie,
    }),
  workspace_page: (context) =>
    new WorkspacePageService({
      workspaceSlug: context.workspaceSlug,
      cookie: context.cookie,
    }),
};

export const getPageService = (documentType: TDocumentTypes, context: HocusPocusServerContext) => {
  const factory = PAGE_SERVICE_FACTORIES[documentType];
  if (!factory) throw new AppError(`Invalid document type ${documentType} provided.`);
  return factory(context);
};

/** Página com sistema fala pela árvore do sistema; sem sistema, é da wiki. */
export const getDocumentTypeForProject = (projectId: string | null | undefined): TDocumentTypes =>
  projectId ? "project_page" : "workspace_page";
