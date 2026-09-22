/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { renderFormattedDate } from "@plane/utils";
// hooks
import { usePortalDoChamado } from "@/hooks/use-portal-contas";
// services
import type { TAvaliacaoDoCliente } from "@/services/portal-contas.service";

type Props = { workspaceSlug: string; issueId: string };

function LinhaDaAvaliacao({ avaliacao }: { avaliacao: TAvaliacaoDoCliente }) {
  return (
    <li className="flex flex-col gap-0.5 text-13">
      <span className="text-primary">
        Resolveu: <strong>{avaliacao.expectation_label}</strong> · Atendimento:{" "}
        <strong>{avaliacao.service_rating_label}</strong>
        {!avaliacao.is_current && <span className="text-tertiary"> (antes de reabrir)</span>}
      </span>
      {avaliacao.comment && <span className="text-secondary">“{avaliacao.comment}”</span>}
      <span className="text-11 text-tertiary">{renderFormattedDate(avaliacao.created_at)}</span>
    </li>
  );
}

/**
 * Quem abriu pelo portal do cliente e como ele avaliou o atendimento.
 * Some quando o chamado não veio do portal.
 */
export function PortalDoChamado({ workspaceSlug, issueId }: Props) {
  const { data } = usePortalDoChamado(workspaceSlug, issueId);
  if (!data) return null;

  return (
    <div className="mx-6 mb-2 flex flex-col gap-2 rounded-md border border-subtle px-3 py-2">
      <span className="text-13 text-secondary">
        Aberto pelo portal do cliente por <strong className="text-primary">{data.account.name}</strong> (
        {data.account.email})
      </span>
      {data.evaluations.length === 0 && (
        <span className="text-12 text-tertiary">O cliente ainda não avaliou o atendimento.</span>
      )}
      {data.evaluations.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-12 font-medium text-secondary">Avaliação do cliente</span>
          <ul className="flex flex-col gap-2">
            {data.evaluations.map((avaliacao) => (
              <LinhaDaAvaliacao key={avaliacao.id} avaliacao={avaliacao} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
