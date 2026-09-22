/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Copy } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { botaoSecundario } from "@/components/ouvidoria/comum";
import { buildLinkDeInscricao } from "@/components/ouvidoria/helpers";
// hooks
import { useConfigDeCurriculos } from "@/hooks/use-ouvidoria";

/**
 * Interruptor da página pública de currículos e o link para divulgar. O
 * endereço sai do próprio navegador: o espaço pode estar em domínio próprio.
 */
export function InscricaoPeloSite({ slug }: { slug: string }) {
  const { data, save } = useConfigDeCurriculos(slug, true);
  const [isSalvando, setIsSalvando] = useState(false);
  const isAberto = data?.site_enabled ?? false;
  const link = typeof window === "undefined" ? "" : buildLinkDeInscricao(window.location.origin, slug);

  const onToggle = async () => {
    setIsSalvando(true);
    try {
      await save({ site_enabled: !isAberto });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message: "Não foi possível salvar. Tente de novo." });
    } finally {
      setIsSalvando(false);
    }
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(link);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Copiado", message: "O link do site foi copiado." });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-6 py-3 text-12">
      <label className="flex items-center gap-2 text-13 text-primary">
        <input type="checkbox" checked={isAberto} disabled={isSalvando} onChange={() => void onToggle()} />
        Receber currículos pelo site
      </label>
      {isAberto && (
        <>
          <code className="min-w-0 truncate rounded border border-subtle bg-surface-2 px-2 py-1 text-12 text-secondary">
            {link}
          </code>
          <button type="button" className={botaoSecundario} onClick={() => void onCopy()}>
            <Copy className="h-3.5 w-3.5" />
            Copiar link
          </button>
        </>
      )}
      {!isAberto && <span className="text-secondary">A página pública responde que as inscrições estão fechadas.</span>}
    </div>
  );
}
