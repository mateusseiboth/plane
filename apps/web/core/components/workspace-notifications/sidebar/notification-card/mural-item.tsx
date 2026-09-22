/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Megaphone } from "lucide-react";
import { Row } from "@plane/ui";
import { calculateTimeAgo, cn } from "@plane/utils";
// hooks
import { useNotification } from "@/hooks/store/notifications/use-notification";
import { useAppRouter } from "@/hooks/use-app-router";

type Props = { workspaceSlug: string; notificationId: string };

/**
 * Aviso de recado novo no mural. Não tem chamado nem sistema: abre o recado na
 * página do Mural pelo id guardado em `entity_identifier`.
 */
export const NotificationMuralItem = observer(function NotificationMuralItem({ workspaceSlug, notificationId }: Props) {
  const router = useAppRouter();
  const { asJson: notification, markNotificationAsRead } = useNotification(notificationId);
  const isNaoLida = notification.read_at === null || notification.read_at === undefined;

  const onOpen = async () => {
    if (isNaoLida) await markNotificationAsRead(workspaceSlug).catch(() => undefined);
    router.push(`/${workspaceSlug}/mural/?recado=${notification.entity_identifier ?? ""}`);
  };

  return (
    <Row
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 border-b border-subtle py-4 transition-all",
        {
          "bg-accent-primary/5": isNaoLida,
        }
      )}
      onClick={onOpen}
    >
      {isNaoLida && (
        <div className="absolute top-[50%] left-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" />
      )}
      <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-layer-1">
        <Megaphone className="h-5 w-5 text-accent-primary" />
      </div>
      <div className="w-full min-w-0 space-y-1">
        <p className="truncate text-body-xs-medium text-primary">{notification.title || "Novo recado no mural"}</p>
        <div className="flex items-center gap-3 text-caption-sm-regular text-secondary">
          <p className="flex-1 truncate">{notification.message_html}</p>
          <p className="flex-shrink-0 text-tertiary">
            {notification.created_at && calculateTimeAgo(notification.created_at)}
          </p>
        </div>
      </div>
    </Row>
  );
});
