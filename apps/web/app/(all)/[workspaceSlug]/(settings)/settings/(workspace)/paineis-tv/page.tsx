/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

/**
 * Configurações > Painéis de TV: as chaves de API que abrem os painéis sem
 * login e o mapeamento das colunas do TI e da Qualidade. Exige `panel.manage`.
 */
import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ChavesDePainel } from "@/components/painel-tv/gestao/chaves-de-painel";
import { ColunasDoPainel, PAINEIS_COM_COLUNAS } from "@/components/painel-tv/gestao/colunas-do-painel";
import { PAINEIS_DA_TV } from "@/components/painel-tv/painel-helpers";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useChavesDePainel, useColunasDoPainel } from "@/hooks/use-paineis-de-tv";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useMyWorkspaceActions } from "@/hooks/use-workflow-role";
// local imports
import { PaineisDeTvSettingsHeader } from "./header";

function PaineisDeTvSettingsPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { can, isLoading: carregandoAcoes } = useMyWorkspaceActions(slug);
  const podeGerenciar = can("panel.manage");
  const [painelDasColunas, setPainelDasColunas] = useState(PAINEIS_COM_COLUNAS[0]!.chave);

  const { chaves, isLoading, refetch } = useChavesDePainel(slug, podeGerenciar);
  const { configuracao, refetch: recarregarColunas } = useColunasDoPainel(slug, painelDasColunas, podeGerenciar);

  if (!carregandoAcoes && !podeGerenciar) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<PaineisDeTvSettingsHeader />} hugging>
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - Painéis de TV` : undefined} />
      <SettingsHeading
        title="Painéis de TV"
        description="Telas de parede que abrem sem login, com uma chave de API por TV."
      />

      <div className="flex flex-wrap gap-2 py-3">
        {PAINEIS_DA_TV.map((painel) => (
          <a
            key={painel.chave}
            href={`/${slug}/painel/${painel.chave}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 rounded-md border border-subtle px-3 py-1.5 text-13 text-secondary hover:text-primary"
          >
            {painel.titulo}
            <ExternalLink className="size-3.5" />
          </a>
        ))}
      </div>

      {isLoading ? (
        <div className="py-6 text-13 text-secondary">Carregando…</div>
      ) : (
        <ChavesDePainel workspaceSlug={slug} chaves={chaves} recarregar={() => void refetch()} />
      )}

      <div className="mt-10">
        <SettingsHeading
          title="Colunas dos painéis"
          description="Quais etapas cada coluna recolhe no painel do TI e no da Qualidade."
        />
        <div className="flex gap-2 py-3">
          {PAINEIS_COM_COLUNAS.map((painel) => (
            <button
              key={painel.chave}
              type="button"
              onClick={() => setPainelDasColunas(painel.chave)}
              className={`rounded-md border px-3 py-1.5 text-13 ${
                painelDasColunas === painel.chave
                  ? "border-accent-primary bg-accent-primary/10 text-primary"
                  : "border-subtle text-secondary"
              }`}
            >
              {painel.titulo}
            </button>
          ))}
        </div>
        <ColunasDoPainel
          workspaceSlug={slug}
          painel={painelDasColunas}
          configuracao={configuracao}
          recarregar={() => void recarregarColunas()}
        />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(PaineisDeTvSettingsPage);
