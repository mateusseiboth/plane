/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// hooks
import { useWidgetsInstalados } from "@/hooks/use-widgets-instalados";
// services
import { widgetService } from "@/services/widget.service";

/**
 * "Meus widgets": enviar e remover o widget que só aparece na home da própria
 * pessoa. Depois de cada mudança, a lista da grade é recarregada.
 */
export function useMeusWidgets() {
  const instalados = useWidgetsInstalados();
  const [isUploading, setIsUploading] = useState(false);

  const uploadMeuWidget = async (file: File) => {
    setIsUploading(true);
    try {
      const widget = await widgetService.uploadMine(file);
      await instalados.refetch();
      return widget;
    } finally {
      setIsUploading(false);
    }
  };

  const removeMeuWidget = async (id: string) => {
    await widgetService.removeMine(id);
    await instalados.refetch();
  };

  return { isUploading, uploadMeuWidget, removeMeuWidget };
}
