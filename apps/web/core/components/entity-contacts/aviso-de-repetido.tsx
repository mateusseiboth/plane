/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlertTriangle } from "lucide-react";
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useContactDuplicates } from "@/hooks/use-entity-contacts";
// local imports
import { onlyDigitos } from "./helpers";

type Props = {
  workspaceSlug: string;
  phone: string;
  email: string;
  /** Na edição, o próprio contato não conta. */
  contactId?: string;
};

const MATCH_LABELS = { phone: "telefone", email: "e-mail" } as const;

/** Aviso, não trava: pode ser a mesma pessoa ou alguém que divide o telefone. */
export function AvisoDeRepetido({ workspaceSlug, phone, email, contactId }: Props) {
  const digitos = useDebounce(onlyDigitos(phone), 400);
  const emailAdiado = useDebounce(email.trim(), 400);
  // Telefone incompleto só geraria falso alarme.
  const phoneQuery = digitos.length >= 10 ? digitos : undefined;
  const emailQuery = emailAdiado.includes("@") ? emailAdiado : undefined;
  const { duplicates } = useContactDuplicates(workspaceSlug, {
    phone: phoneQuery,
    email: emailQuery,
    exclude_id: contactId,
  });

  if (duplicates.length === 0) return null;

  return (
    <div className="rounded border border-warning-subtle bg-warning-subtle px-3 py-2 text-12 text-primary">
      <p className="flex items-center gap-1.5 font-medium">
        <AlertTriangle className="h-3.5 w-3.5" /> Já existe contato com estes dados:
      </p>
      <ul className="mt-1 space-y-0.5">
        {duplicates.map((d) => (
          <li key={d.id}>
            {d.name}
            {d.entity_name ? ` (${d.entity_name})` : ""}: mesmo {d.matches.map((m) => MATCH_LABELS[m]).join(" e ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
