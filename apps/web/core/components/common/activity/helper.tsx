/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC, ReactNode } from "react";
import {
  RotateCcw,
  Network,
  Inbox,
  AlignLeft,
  Paperclip,
  Type,
  FileText,
  Hash,
  Clock,
  Bell,
  GitBranch,
  Timer,
  ListTodo,
  Layers,
} from "lucide-react";
// components

import {
  LinkIcon,
  ArchiveIcon,
  CycleIcon,
  GlobeIcon,
  DueDatePropertyIcon,
  EstimatePropertyIcon,
  GridLayoutIcon,
  IntakeIcon,
  LabelPropertyIcon,
  MembersPropertyIcon,
  ModuleIcon,
  PriorityPropertyIcon,
  StartDatePropertyIcon,
  StatePropertyIcon,
} from "@plane/propel/icons";
import { store } from "@/lib/store-context";
import type { TProjectActivity } from "@/plane-web/types";

type ActivityIconMap = {
  [key: string]: FC<{ className?: string }>;
};
export const iconsMap: ActivityIconMap = {
  priority: PriorityPropertyIcon,
  archived_at: ArchiveIcon,
  restored: RotateCcw,
  link: LinkIcon,
  start_date: StartDatePropertyIcon,
  target_date: DueDatePropertyIcon,
  label: LabelPropertyIcon,
  inbox: Inbox,
  description: AlignLeft,
  assignee: MembersPropertyIcon,
  attachment: Paperclip,
  name: Type,
  state: StatePropertyIcon,
  estimate: EstimatePropertyIcon,
  cycle: CycleIcon,
  module: ModuleIcon,
  page: FileText,
  network: GlobeIcon,
  identifier: Hash,
  timezone: Clock,
  is_project_updates_enabled: Bell,
  is_epic_enabled: GridLayoutIcon,
  is_workflow_enabled: GitBranch,
  is_time_tracking_enabled: Timer,
  is_issue_type_enabled: ListTodo,
  default: Network,
  module_view: ModuleIcon,
  cycle_view: CycleIcon,
  issue_views_view: Layers,
  page_view: FileText,
  intake_view: IntakeIcon,
};

export const messages = (activity: TProjectActivity): { message: string | ReactNode; customUserName?: string } => {
  const activityType = activity.field;
  const newValue = activity.new_value;
  const oldValue = activity.old_value;
  const verb = activity.verb;
  const workspaceDetail = store.workspaceRoot.getWorkspaceById(activity.workspace);

  const getBooleanActionText = (value: string | undefined) => {
    if (value === "true") return "ativou";
    if (value === "false") return "desativou";
    return verb;
  };

  switch (activityType) {
    case "priority":
      return {
        message: (
          <>
            definiu a prioridade como <span className="font-medium text-primary">{newValue || "nenhuma"}</span>
          </>
        ),
      };
    case "archived_at":
      return {
        message: newValue === "restore" ? "restaurou o projeto" : "arquivou o projeto",
        customUserName: newValue === "archive" ? "Avião" : undefined,
      };
    case "name":
      return {
        message: (
          <>
            renomeou o projeto para <span className="font-medium text-primary">{newValue}</span>
          </>
        ),
      };
    case "description":
      return {
        message: newValue ? "atualizou a descrição do projeto" : "removeu a descrição do projeto",
      };
    case "start_date":
      return {
        message: (
          <>
            {newValue ? (
              <>
                definiu a data de início como <span className="font-medium text-primary">{newValue}</span>
              </>
            ) : (
              "removeu a data de início"
            )}
          </>
        ),
      };
    case "target_date":
      return {
        message: (
          <>
            {newValue ? (
              <>
                definiu a data de entrega como <span className="font-medium text-primary">{newValue}</span>
              </>
            ) : (
              "removeu a data de entrega"
            )}
          </>
        ),
      };
    case "state":
      return {
        message: (
          <>
            definiu o estado como <span className="font-medium text-primary">{newValue || "nenhum"}</span>
          </>
        ),
      };
    case "estimate":
      return {
        message: (
          <>
            {newValue ? (
              <>
                definiu o ponto de estimativa como <span className="font-medium text-primary">{newValue}</span>
              </>
            ) : (
              <>
                removeu o ponto de estimativa
                {oldValue && (
                  <>
                    {" "}
                    <span className="font-medium text-primary">{oldValue}</span>
                  </>
                )}
              </>
            )}
          </>
        ),
      };
    case "cycles":
      return {
        message: (
          <>
            <span>
              {verb} este projeto {verb === "removed" ? "do" : "ao"} ciclo{" "}
            </span>
            {verb !== "removed" ? (
              <a
                href={`/${workspaceDetail?.slug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex font-medium text-primary"
              >
                {activity.new_value}
              </a>
            ) : (
              <span className="font-medium text-primary">{activity.old_value || "Ciclo desconhecido"}</span>
            )}
          </>
        ),
      };
    case "modules":
      return {
        message: (
          <>
            <span>
              {verb} este projeto {verb === "removed" ? "do" : "ao"} módulo{" "}
            </span>
            <span className="font-medium text-primary">
              {verb === "removed" ? oldValue : newValue || "Módulo desconhecido"}
            </span>
          </>
        ),
      };
    case "labels":
      return {
        message: (
          <>
            {verb} a etiqueta{" "}
            <span className="font-medium text-primary">{newValue || oldValue || "Etiqueta sem título"}</span>
          </>
        ),
      };
    case "inbox":
      return {
        message: <>{newValue ? "ativou" : "desativou"} a caixa de entrada</>,
      };
    case "page":
      return {
        message: (
          <>
            {newValue ? "criou" : "removeu"} a página do projeto{" "}
            <span className="font-medium text-primary">{newValue || oldValue || "Página sem título"}</span>
          </>
        ),
      };
    case "network":
      return {
        message: <>{newValue ? "ativou" : "desativou"} o acesso de rede</>,
      };
    case "identifier":
      return {
        message: (
          <>
            atualizou o identificador do projeto para <span className="font-medium text-primary">{newValue || "nenhum"}</span>
          </>
        ),
      };
    case "timezone":
      return {
        message: (
          <>
            alterou o fuso horário do projeto para <span className="font-medium text-primary">{newValue || "padrão"}</span>
          </>
        ),
      };
    case "module_view":
    case "cycle_view":
    case "issue_views_view":
    case "page_view":
    case "intake_view":
      return {
        message: (
          <>
            {getBooleanActionText(newValue)} a visualização {activityType.replace(/_view$/, "").replace(/_/g, " ")}
          </>
        ),
      };
    case "is_project_updates_enabled":
      return {
        message: <>{getBooleanActionText(newValue)} as atualizações do projeto</>,
      };
    case "is_epic_enabled":
      return {
        message: <>{getBooleanActionText(newValue)} os épicos</>,
      };
    case "is_workflow_enabled":
      return {
        message: <>{getBooleanActionText(newValue)} o fluxo de trabalho personalizado</>,
      };
    case "is_time_tracking_enabled":
      return {
        message: <>{getBooleanActionText(newValue)} o controle de tempo</>,
      };
    case "is_issue_type_enabled":
      return {
        message: <>{getBooleanActionText(newValue)} os tipos de chamado</>,
      };
    default:
      return {
        message: `${verb} ${activityType?.replace(/_/g, " ")} `,
      };
  }
};
