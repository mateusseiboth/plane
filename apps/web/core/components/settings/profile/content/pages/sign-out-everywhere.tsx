/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { LogOut } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import { AuthService } from "@/services/auth.service";

const authService = new AuthService();

/** Encerra a sessão em todos os navegadores e aparelhos, inclusive neste. */
export function SignOutEverywhere() {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onConfirm = async () => {
    if (!window.confirm("Encerrar a sessão em todos os lugares? Você vai precisar entrar de novo.")) return;
    setIsSubmitting(true);
    try {
      await authService.signOutEverywhere();
      window.location.href = "/";
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Erro",
        message: "Não foi possível encerrar as sessões. Tente novamente.",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-10 flex flex-col gap-3 border-t border-subtle pt-6">
      <div>
        <h4 className="text-14 font-medium text-primary">Sair de todos os lugares</h4>
        <p className="text-13 text-secondary">Encerra a sessão em todos os navegadores e aparelhos, inclusive neste.</p>
      </div>
      <div>
        <Button variant="secondary" size="lg" onClick={onConfirm} loading={isSubmitting}>
          <LogOut className="mr-1 size-4" /> Sair de todos os lugares
        </Button>
      </div>
    </div>
  );
}
