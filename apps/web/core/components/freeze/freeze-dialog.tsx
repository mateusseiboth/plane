/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Snowflake, Sun, X } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { Dialog, EDialogWidth } from "@plane/propel/dialog";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TFreezeEvent } from "@plane/types";
// helpers
import { applyApiFieldErrors } from "@/helpers/api-field-errors.helper";
// hooks
import { useFreezeEvents } from "@/hooks/use-freeze";
// services
import freezeService, { type TFreezeSubject } from "@/services/freeze.service";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  subject: TFreezeSubject;
  id: string;
  name: string;
  isFrozen: boolean;
  onDone: () => void;
};

// O que muda para o operador em cada caso. Vai no diálogo antes de confirmar.
const FREEZE_EFFECTS: Record<TFreezeSubject, string> = {
  entity: "Os contatos e as contas do portal desta entidade também ficam desativados.",
  member: "O usuário não consegue mais entrar e as sessões abertas são encerradas.",
};

const ACTION_LABELS: Record<TFreezeEvent["action"], string> = {
  freeze: "Congelou",
  unfreeze: "Descongelou",
};

function FreezeHistory({ events }: { events: TFreezeEvent[] }) {
  if (events.length === 0) return <p className="text-13 text-secondary">Sem congelamentos anteriores.</p>;
  return (
    <ul className="max-h-48 space-y-2 overflow-y-auto">
      {events.map((event) => (
        <li key={event.id} className="rounded border border-subtle px-3 py-2 text-13">
          <div className="flex justify-between gap-2 text-secondary">
            <span>
              {ACTION_LABELS[event.action]}
              {event.actor_name ? `, por ${event.actor_name}` : ""}
            </span>
            <span>{new Date(event.created_at).toLocaleString("pt-BR")}</span>
          </div>
          {event.reason && <p className="mt-1 text-primary">{event.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

export function FreezeDialog(props: Props) {
  const { open, onClose, workspaceSlug, subject, id, name, isFrozen, onDone } = props;
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { events, refetch } = useFreezeEvents(open ? workspaceSlug : undefined, subject, id);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setReasonError(null);
  }, [open]);

  const submit = async () => {
    if (!isFrozen && !reason.trim()) {
      setReasonError("Informe o motivo do congelamento.");
      return;
    }
    setSaving(true);
    try {
      const apply = isFrozen ? freezeService.unfreeze : freezeService.freeze;
      await apply.call(freezeService, workspaceSlug, subject, id, reason.trim());
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: isFrozen ? "Descongelado" : "Congelado",
        message: `${name} foi ${isFrozen ? "descongelado" : "congelado"}.`,
      });
      await refetch();
      onDone();
      onClose();
    } catch (error) {
      const message = applyApiFieldErrors(
        error,
        (path, text) => path === "reason" && setReasonError(text),
        "Não foi possível concluir. Tente novamente."
      );
      setToast({ type: TOAST_TYPE.ERROR, title: "Erro", message });
    } finally {
      setSaving(false);
    }
  };

  const Icon = isFrozen ? Sun : Snowflake;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <Dialog.Panel width={EDialogWidth.MD}>
        <div className="space-y-4 p-6">
          <div className="flex items-center justify-between">
            <Dialog.Title>
              <span className="flex items-center gap-2">
                <Icon className="h-4 w-4" />
                {isFrozen ? `Descongelar ${name}` : `Congelar ${name}`}
              </span>
            </Dialog.Title>
            <button type="button" onClick={onClose} className="rounded p-1 text-secondary hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          {!isFrozen && <p className="text-13 text-secondary">{FREEZE_EFFECTS[subject]}</p>}

          <div>
            <label htmlFor="freeze-reason" className="mb-1 block text-13 font-medium text-secondary">
              Motivo{isFrozen ? " (opcional)" : ""}
            </label>
            <textarea
              id="freeze-reason"
              value={reason}
              maxLength={500}
              rows={3}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(null);
              }}
              className="focus:border-accent-primary w-full rounded border border-subtle bg-surface-2 px-3 py-2 text-13 text-primary outline-none"
            />
            {reasonError && <p className="mt-1 text-12 text-danger-primary">{reasonError}</p>}
          </div>

          <div>
            <p className="mb-2 text-13 font-medium text-secondary">Histórico</p>
            <FreezeHistory events={events} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" onClick={submit} loading={saving}>
              {isFrozen ? "Descongelar" : "Congelar"}
            </Button>
          </div>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}
