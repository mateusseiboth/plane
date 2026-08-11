/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { getNumberCount } from "@plane/utils";
// components
import { CountChip } from "@/components/common/count-chip";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useRealtimeRefetch } from "@/hooks/use-realtime";
import { useUser } from "@/hooks/store/user";

type TNotificationAppSidebarOption = {
  workspaceSlug: string;
};

export const NotificationAppSidebarOption = observer(function NotificationAppSidebarOption(
  props: TNotificationAppSidebarOption
) {
  const { workspaceSlug } = props;
  // hooks
  const { unreadNotificationsCount, getUnreadNotificationsCount } = useWorkspaceNotifications();
  const { data: currentUser } = useUser();

  useSWR(
    workspaceSlug ? "WORKSPACE_UNREAD_NOTIFICATION_COUNT" : null,
    workspaceSlug ? () => getUnreadNotificationsCount(workspaceSlug) : null
  );

  // O contador reage ao tempo real; o aviso na área de trabalho fica em
  // useAvisoDeChamado, montado no wrapper do espaço de trabalho — aqui dentro
  // ele dependeria deste item da barra lateral estar renderizado.
  useRealtimeRefetch(
    (evento) => evento.entity === "notification" && !!currentUser?.id && evento.receiver === currentUser.id,
    () => {
      if (workspaceSlug) void getUnreadNotificationsCount(workspaceSlug);
    }
  );

  // derived values
  const isMentionsEnabled = unreadNotificationsCount.mention_unread_notifications_count > 0 ? true : false;
  const totalNotifications = isMentionsEnabled
    ? unreadNotificationsCount.mention_unread_notifications_count
    : unreadNotificationsCount.total_unread_notifications_count;

  if (totalNotifications <= 0) return <></>;

  return (
    <div className="ml-auto">
      <CountChip count={`${isMentionsEnabled ? `@ ` : ``}${getNumberCount(totalNotifications)}`} />
    </div>
  );
});
