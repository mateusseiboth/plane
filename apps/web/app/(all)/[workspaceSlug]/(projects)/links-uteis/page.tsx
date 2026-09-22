/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Links úteis: os endereços que a equipe passa para cliente, candidato e TV,
// reunidos num lugar só. Os endereços são montados com a ORIGEM desta tela,
// para o link copiado abrir também fora daqui.

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Link2 } from "lucide-react";
import { PageHead } from "@/components/core/page-title";
import { CartaoDeLink } from "@/components/links-uteis/cartao-de-link";
import { AvisoDaPagina, CabecalhoDaPagina } from "@/components/ouvidoria/comum";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useLinksUteis } from "@/hooks/use-links-uteis";

const readOrigem = () => (typeof window === "undefined" ? "" : window.location.origin);

function LinksUteisPage() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { currentWorkspace } = useWorkspace();
  const { grupos, error, isLoading } = useLinksUteis(slug);
  const origem = readOrigem();

  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - Links úteis` : "Links úteis";

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <PageHead title={pageTitle} />
      <CabecalhoDaPagina
        icone={<Link2 className="h-5 w-5 text-secondary" />}
        titulo="Links úteis"
        subtitulo="Endereços prontos para passar ao cliente, ao candidato e à TV da sala."
      />

      <div className="flex-1 space-y-6 overflow-y-auto p-6">
        {error && <AvisoDaPagina>Não foi possível carregar os links. Tente de novo em instantes.</AvisoDaPagina>}
        {isLoading && <div className="h-40 animate-pulse rounded-lg border border-subtle bg-surface-2" />}

        {grupos.map((grupo) => (
          <section key={grupo.chave} className="space-y-3">
            <h2 className="text-13 font-semibold text-secondary uppercase">{grupo.titulo}</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {grupo.cartoes.map((cartao) => (
                <CartaoDeLink key={cartao.chave} cartao={cartao} origem={origem} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default observer(LinksUteisPage);
