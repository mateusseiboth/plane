/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { ArrowUpToLine, Bot, Building, Building2, Clock, CreditCard, Database, Link2, MessageSquare, Printer, Shield, ShieldCheck, Users, Webhook } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import type { TWorkspaceSettingsTabs } from "@plane/types";

export const WORKSPACE_SETTINGS_ICONS: Record<TWorkspaceSettingsTabs, LucideIcon | React.FC<ISvgIcons>> = {
  general: Building,
  members: Users,
  roles: Shield,
  sla: Clock,
  export: ArrowUpToLine,
  "billing-and-plans": CreditCard,
  webhooks: Webhook,
  entities: Building2,
  ai: Bot,
  "integrations-custom": Link2,
  storage: Database,
  chat: MessageSquare,
  print: Printer,
  auditoria: ShieldCheck,
};
