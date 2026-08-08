/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { SUPPORT_EMAIL } from "@plane/constants";
// ui
import { Button } from "@plane/propel/button";

function ErrorPage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="grid h-screen place-items-center bg-surface-1 p-4">
      <div className="space-y-8 text-center">
        <div className="space-y-2">
          <h3 className="text-16 font-semibold">Ops! Algo deu errado por aqui.</h3>
          <p className="mx-auto text-13 text-secondary md:w-1/2">
            O erro já foi registrado e nossa equipe foi avisada. Se puder descrever o que estava fazendo, escreva para{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent-primary">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button variant="primary" size="lg" onClick={handleRetry}>
            Atualizar
          </Button>
          {/* <Button variant="secondary" size="lg" onClick={() => {}}>
            Sair
          </Button> */}
        </div>
      </div>
    </div>
  );
}

export default ErrorPage;
