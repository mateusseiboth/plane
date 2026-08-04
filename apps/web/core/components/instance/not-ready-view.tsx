/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import Link from "next/link";
import { GOD_MODE_URL } from "@plane/constants";
// assets
import NewLogo from "@/app/assets/images/new-logo.png?url";
import DefaultLayout from "@/layouts/default-layout";
import { PlaneLockup } from "@plane/propel/icons";
import { Button } from "@plane/propel/button";

export function InstanceNotReady() {
  return (
    <DefaultLayout>
      <div className="relative z-10 flex h-screen w-screen overflow-hidden">
        {/* Background decorations */}
        <img
          src={NewLogo}
          className="pointer-events-none absolute -top-24 -left-32 h-56 w-96 object-contain opacity-15"
          alt=""
          aria-hidden="true"
        />
        <img
          src={NewLogo}
          className="pointer-events-none absolute -right-20 -bottom-16 h-56 w-96 object-contain opacity-15"
          alt=""
          aria-hidden="true"
        />
        {/* Main content */}
        <div className="flex h-full w-full flex-col items-center px-8 pt-6 pb-10">
          <div className="sticky top-0 flex w-full shrink-0 items-center justify-between gap-6">
            <PlaneLockup height={20} width={95} className="text-primary" />
          </div>
          <div className="flex h-full w-full flex-col items-center justify-center gap-7">
            <div className="flex flex-col items-center gap-11">
              <img src={NewLogo} className="h-24 w-40 object-contain" alt="Logotipo" />
              <div className="flex max-w-124 flex-col items-center gap-3">
                <h1 className="text-h2-semibold text-primary">Bem-vindo ao Avião</h1>
                <p className="text-center text-body-md-regular text-secondary">
                  Configure sua instância e crie seu primeiro espaço de trabalho para começar a gerenciar projetos e
                  tarefas.
                </p>
              </div>
            </div>
            <a href={GOD_MODE_URL} className="w-72">
              <Button variant="primary" className="w-full" size="xl">
                Começar
              </Button>
            </a>
          </div>
        </div>
      </div>
    </DefaultLayout>
  );
}
