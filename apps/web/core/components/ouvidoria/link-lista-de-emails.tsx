/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { Mail } from "lucide-react";
// components
import { botaoSecundario } from "@/components/ouvidoria/comum";
// hooks
import { useOuvidoriaPermissoes } from "@/hooks/use-ouvidoria";

/** Atalho da tela de Contatos para a lista de e-mails; só para quem tem `contato.export`. */
export function LinkListaDeEmails({ slug }: { slug: string }) {
  const { canExportContatos } = useOuvidoriaPermissoes(slug);
  if (!canExportContatos) return null;
  return (
    <Link href={`/${slug}/contatos/emails`} className={botaoSecundario}>
      <Mail className="h-3.5 w-3.5" />
      Lista de e-mails
    </Link>
  );
}
