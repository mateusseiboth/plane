/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { SelectPesquisavel } from "@/components/common/select-pesquisavel";
import { PageHead } from "@/components/core/page-title";
import { PortalContaModal } from "@/components/portal/contas/portal-conta-modal";
import {
  filterContas,
  readUltimoAcesso,
  type TPortalConta,
  type TSituacaoDaConta,
} from "@/components/portal/contas/portal-conta-rules";
import { PortalSenhaModal } from "@/components/portal/contas/portal-senha-modal";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { usePortalContas } from "@/hooks/use-portal-contas";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// services
import portalContasService from "@/services/portal-contas.service";
// local imports
import { PortalWorkspaceSettingsHeader } from "./header";

const SITUACOES: { value: TSituacaoDaConta; label: string }[] = [
  { value: "ativas", label: "Ativas" },
  { value: "inativas", label: "Inativas" },
  { value: "todas", label: "Todas" },
];

function PortalSettingsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { getProjectById } = useProject();
  const { can, isLoading: carregandoAcoes } = useMyWorkspaceActions(slug);
  const podeGerenciar = can("portal.manage");
  const { contas, emailLigado, isLoading, refetch } = usePortalContas(slug, podeGerenciar);

  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<TSituacaoDaConta>("ativas");
  const [editando, setEditando] = useState<TPortalConta | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [redefinindo, setRedefinindo] = useState<TPortalConta | null>(null);

  const visiveis = useMemo(() => filterContas(contas, busca, situacao), [contas, busca, situacao]);

  if (!carregandoAcoes && !podeGerenciar) return <NotAuthorizedView section="settings" className="h-auto" />;

  const openForm = (conta: TPortalConta | null) => {
    setEditando(conta);
    setFormAberto(true);
  };

  const toggleAtiva = async (conta: TPortalConta) => {
    try {
      await portalContasService.update(slug, conta.id, { is_active: !conta.is_active });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Salvo",
        message: conta.is_active ? "Conta desativada." : "Conta reativada.",
      });
      await refetch();
    } catch (error) {
      const message = (error as { detail?: string })?.detail ?? "Não foi possível alterar a conta.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    }
  };

  const nomesDosSistemas = (conta: TPortalConta) =>
    conta.project_ids
      .map((id) => getProjectById(id)?.name)
      .filter(Boolean)
      .join(", ") || "Nenhum";

  const title = t("workspace_settings.settings.portal.title");

  return (
    <SettingsContentWrapper header={<PortalWorkspaceSettingsHeader />} hugging>
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - ${title}` : undefined} />
      <SettingsHeading
        title={title}
        description="Contas de quem abre e acompanha solicitações pelo portal do cliente."
        control={
          <Button variant="primary" size="sm" onClick={() => openForm(null)}>
            Nova conta
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3 py-3">
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, e-mail ou entidade"
          className="w-72"
        />
        <SelectPesquisavel value={situacao} onChange={setSituacao} opcoes={SITUACOES} className="w-40" />
      </div>

      {isLoading ? (
        <div className="py-6 text-13 text-secondary">Carregando…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-subtle">
          <table className="w-full text-13">
            <thead className="bg-surface-2 text-left text-12 text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Conta</th>
                <th className="px-3 py-2 font-medium">Entidade</th>
                <th className="px-3 py-2 font-medium">Sistemas</th>
                <th className="px-3 py-2 font-medium">Último acesso</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-secondary">
                    Nenhuma conta encontrada.
                  </td>
                </tr>
              )}
              {visiveis.map((conta) => (
                <tr key={conta.id} className="border-t border-subtle">
                  <td className="px-3 py-2">
                    <div className="font-medium text-primary">
                      {conta.name}
                      {!conta.is_active && <span className="ml-2 text-11 text-tertiary">(inativa)</span>}
                    </div>
                    <div className="text-12 text-secondary">{conta.email}</div>
                  </td>
                  <td className="px-3 py-2 text-secondary">{conta.entity?.name ?? "Nenhuma"}</td>
                  <td className="px-3 py-2 text-secondary">{nomesDosSistemas(conta)}</td>
                  <td className="px-3 py-2 text-secondary">{readUltimoAcesso(conta.last_login_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" size="sm" onClick={() => openForm(conta)}>
                        Editar
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setRedefinindo(conta)}>
                        Redefinir senha
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => toggleAtiva(conta)}>
                        {conta.is_active ? "Desativar" : "Reativar"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PortalContaModal
        workspaceSlug={slug}
        conta={editando}
        open={formAberto}
        onClose={() => setFormAberto(false)}
        onSaved={() => void refetch()}
      />
      <PortalSenhaModal
        workspaceSlug={slug}
        conta={redefinindo}
        emailLigado={emailLigado}
        onClose={() => setRedefinindo(null)}
      />
    </SettingsContentWrapper>
  );
}

export default observer(PortalSettingsPage);
