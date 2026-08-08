/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Image, BrainCog, Cog, Mail } from "lucide-react";
// plane imports
import { LockIcon, WorkspaceIcon } from "@plane/propel/icons";
// types
import type { TSidebarMenuItem } from "./types";

export type TCoreSidebarMenuKey = "general" | "email" | "workspace" | "authentication" | "ai" | "image";

export const coreSidebarMenuLinks: Record<TCoreSidebarMenuKey, TSidebarMenuItem> = {
  general: {
    Icon: Cog,
    name: "Geral",
    description: "Identifique suas instâncias e obtenha detalhes importantes.",
    href: `/general/`,
  },
  email: {
    Icon: Mail,
    name: "E-mail",
    description: "Configure seus controles de SMTP.",
    href: `/email/`,
  },
  workspace: {
    Icon: WorkspaceIcon,
    name: "Espaços de trabalho",
    description: "Gerencie todos os espaços de trabalho nesta instância.",
    href: `/workspace/`,
  },
  authentication: {
    Icon: LockIcon,
    name: "Autenticação",
    description: "Configure os modos de autenticação.",
    href: `/authentication/`,
  },
  ai: {
    Icon: BrainCog,
    name: "Inteligência artificial",
    description: "Configure suas credenciais da OpenAI.",
    href: `/ai/`,
  },
  image: {
    Icon: Image,
    name: "Imagens no Avião",
    description: "Permita bibliotecas de imagens de terceiros.",
    href: `/image/`,
  },
};
