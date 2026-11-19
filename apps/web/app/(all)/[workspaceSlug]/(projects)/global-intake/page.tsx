/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Inbox, AlertCircle, Search } from "lucide-react";
import { Intake } from "@plane/propel/icons";
import { cn, calculateTimeAgo } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { InboxIssueRoot } from "@/components/inbox";
import { IntakeListPrintDocument, PrintButton } from "@/components/print";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
import { useTranslation } from "@plane/i18n";
import { APIService } from "@/services/api.service";
import { API_BASE_URL } from "@plane/constants";
import {
  ABAS_DA_TRIAGEM_GLOBAL,
  readAba,
  readAbaPadraoDaTriagemGlobal,
  readAbaDaSolicitacao,
  readAbaDaTriagemDoSistema,
} from "@/components/inbox/global/abas-da-triagem-global";
import { readRotuloDaTriagem } from "@/components/inbox/global/rotulo-da-triagem";
import { EInboxIssueCurrentTab } from "@plane/types";
import { buildLinhaDaSolicitacao } from "@/components/inbox/global/linha-da-solicitacao";

const ABA_DA_TRIAGEM_DO_SISTEMA: Record<string, EInboxIssueCurrentTab> = {
  open: EInboxIssueCurrentTab.OPEN,
  closed: EInboxIssueCurrentTab.CLOSED,
};

class GlobalIntakeService extends APIService {
  constructor() { super(API_BASE_URL); }
  list(slug: string, aba: string) {
    return this.get(`/api/workspaces/${slug}/global-intake-issues/`, {
      params: {status: aba, per_page: 100, cursor: "100:0:0"},
    }).then((r) => r?.data?.results ?? []).catch(() => []);
  }
}

const globalIntakeService = new GlobalIntakeService();

function GlobalIntakePage() {
  const { workspaceSlug } = useParams();
  const searchParams = useSearchParams();
  const selectedProjectId = searchParams.get("projectId");
  const inboxIssueId = searchParams.get("inboxIssueId") ?? undefined;
  const navigationTab = ABA_DA_TRIAGEM_DO_SISTEMA[searchParams.get("currentTab") ?? ""];

  const { joinedProjectIds, getProjectById } = useProject();
  const { currentWorkspace } = useWorkspace();
  const { can, isLoading: isAcoesLoading } = useMyWorkspaceActions(workspaceSlug?.toString());
  const { t } = useTranslation();

  // A lista da barra lateral é longa (um item por sistema): sem busca, achar um
  // sistema pelo nome vira rolagem no olho.
  const [buscaProjeto, setBuscaProjeto] = useState("");
  const todosProjetos = (joinedProjectIds ?? [])
    .map((id) => getProjectById(id))
    .filter((p) => !!p);
  const termo = buscaProjeto.trim().toLowerCase();
  const intakeProjects = termo
    ? todosProjetos.filter((p) => `${p?.name ?? ""} ${p?.identifier ?? ""}`.toLowerCase().includes(termo))
    : todosProjetos;

  const activeProject = selectedProjectId
    ? intakeProjects.find((p) => p?.id === selectedProjectId)
    : undefined;

  const rotulo = t(readRotuloDaTriagem(can));
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - ${rotulo}` : rotulo;

  // ── Global list state (when no project is selected) ──────────────────────
  // Até a pessoa trocar de aba, vale a aba padrão da função dela.
  const [abaEscolhida, setStatusFilter] = useState<string | null>(null);
  const statusFilter = abaEscolhida ?? readAbaPadraoDaTriagemGlobal(can);
  const [allIntakes, setAllIntakes] = useState<any[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);

  useEffect(() => {
    // Sem a função carregada a aba padrão ainda não é conhecida.
    if (activeProject || !workspaceSlug || isAcoesLoading) return;
    setLoadingAll(true);
    globalIntakeService.list(workspaceSlug.toString(), statusFilter)
      .then(setAllIntakes)
      .finally(() => setLoadingAll(false));
  }, [workspaceSlug, activeProject, statusFilter, isAcoesLoading]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      <PageHead title={pageTitle} />

      {/* Project selector sidebar */}
      <div className="flex h-full w-56 flex-shrink-0 flex-col border-r border-subtle">
        <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
          <Intake className="size-4 text-secondary" />
          <span className="text-13 font-semibold">Sistemas</span>
        </div>
        <div className="flex items-center gap-1.5 border-b border-subtle px-3 py-2">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            value={buscaProjeto}
            onChange={(e) => setBuscaProjeto(e.target.value)}
            placeholder="Buscar sistema"
            className="w-full bg-transparent text-12 outline-none placeholder:text-placeholder"
          />
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {/* "All" option */}
          <Link
            href={`/${workspaceSlug}/global-intake/`}
            className={cn(
              "flex w-full items-center gap-2 px-4 py-2 text-left text-13 hover:bg-surface-2 transition-colors",
              !activeProject && "bg-surface-1-80 font-medium"
            )}
          >
            <Inbox className="size-3.5 text-secondary" />
            <span>Todos os sistemas</span>
          </Link>
          {intakeProjects.length === 0 && (
            <p className="px-4 py-3 text-xs text-secondary">
              {termo ? `Nenhum sistema com "${buscaProjeto}".` : "Nenhum sistema encontrado."}
            </p>
          )}
          {intakeProjects.map((project) => {
            if (!project) return null;
            const isActive = activeProject?.id === project.id;
            return (
              <Link
                key={project.id}
                href={`/${workspaceSlug}/global-intake/?projectId=${project.id}`}
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2 text-left text-13 hover:bg-surface-2 transition-colors",
                  isActive && "bg-surface-1-80 font-medium"
                )}
              >
                <Intake className="size-3.5 text-secondary" />
                <span className="truncate">{project.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Intake content */}
      <div className="h-full flex-1 overflow-hidden">
        {activeProject ? (
          <InboxIssueRoot
            workspaceSlug={workspaceSlug.toString()}
            projectId={activeProject.id}
            inboxIssueId={inboxIssueId}
            inboxAccessible={true}
            navigationTab={navigationTab}
          />
        ) : (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Status filter tabs */}
            <div className="flex items-center gap-1 border-b border-subtle px-6 py-3">
              {ABAS_DA_TRIAGEM_GLOBAL.map((aba) => (
                <button
                  key={aba.chave}
                  onClick={() => setStatusFilter(aba.chave)}
                  className={cn(
                    "rounded-full px-3 py-1 text-12 font-medium transition-colors",
                    statusFilter === aba.chave
                      ? "bg-accent-primary text-white"
                      : "bg-surface-2 text-secondary hover:text-primary"
                  )}
                >
                  {aba.rotulo}
                </button>
              ))}
              <div className="ml-auto">
                <PrintButton
                  documentTitle="Solicitações"
                  auditEntity="intake"
                  auditEntityId={currentWorkspace?.id ?? ""}
                  auditMetadata={{escopo: "listagem"}}
                />
              </div>
            </div>

            <IntakeListPrintDocument
              title="Solicitações"
              subtitle={currentWorkspace?.name}
              statusLabel={readAba(statusFilter)?.rotulo}
              records={allIntakes}
            />

            <div className="flex-1 overflow-y-auto">
              {loadingAll && (
                <div className="flex h-full items-center justify-center text-13 text-secondary">Carregando...</div>
              )}
              {!loadingAll && allIntakes.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-secondary">
                  <AlertCircle className="h-10 w-10 opacity-40" />
                  <p className="text-sm">Nenhuma solicitação com status "{readAba(statusFilter)?.rotulo}".</p>
                </div>
              )}
              {!loadingAll && allIntakes.map((intake: any) => {
                const linha = buildLinhaDaSolicitacao(intake);
                return (
                <Link
                  key={intake.id}
                  href={`/${workspaceSlug}/global-intake/?projectId=${intake.project?.id}&inboxIssueId=${intake.issue?.id}&currentTab=${readAbaDaTriagemDoSistema(intake.status)}`}
                  className="flex items-center gap-3 border-b border-subtle px-6 py-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-10 font-medium", readAbaDaSolicitacao(intake)?.cor ?? "bg-surface-2 text-secondary")}>
                        {readAbaDaSolicitacao(intake)?.rotulo ?? "?"}
                      </span>
                      {linha.numero && <span className="shrink-0 font-mono text-11 font-semibold text-primary">{linha.numero}</span>}
                      {linha.noSistema && <span className="shrink-0 text-11 text-tertiary">{linha.noSistema}</span>}
                      {linha.entidade && <span className="truncate text-11 text-secondary">{linha.entidade}</span>}
                    </div>
                    <p className="mt-1 truncate text-13">{intake.issue?.name ?? "Sem título"}</p>
                    {linha.ondeEsta && <p className="mt-0.5 text-11 text-tertiary">{linha.ondeEsta}</p>}
                  </div>
                  <span className="shrink-0 text-11 text-tertiary">{calculateTimeAgo(intake.created_at)}</span>
                </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default observer(GlobalIntakePage);
