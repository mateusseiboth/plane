/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { AUTH_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import AviaoLockup from "@/app/assets/logos/aviao-horizontal.svg?url";
import { PageHead } from "@/components/core/page-title";
import { EAuthModes } from "@/helpers/authentication.helper";
import { useInstance } from "@/hooks/store/use-instance";

const authContentMap = {
  [EAuthModes.SIGN_IN]: {
    pageTitle: "Criar conta",
    text: "auth.common.new_to_plane",
    linkText: "Criar conta",
    linkHref: "/sign-up",
  },
  [EAuthModes.SIGN_UP]: {
    pageTitle: "Entrar",
    text: "auth.common.already_have_an_account",
    linkText: "Entrar",
    linkHref: "/sign-in",
  },
};

type AuthHeaderProps = {
  type: EAuthModes;
};

export const AuthHeader = observer(function AuthHeader({ type }: AuthHeaderProps) {
  const { t } = useTranslation();
  // store
  const { config } = useInstance();
  // derived values
  const enableSignUpConfig = config?.enable_signup ?? false;

  return (
    <AuthHeaderBase
      pageTitle={authContentMap[type].pageTitle}
      additionalAction={
        enableSignUpConfig && (
          <div className="flex flex-col items-end text-center text-13 font-medium text-tertiary sm:flex-row sm:items-center sm:gap-2">
            <span className="text-body-sm-regular text-tertiary">{t(authContentMap[type].text)}</span>
            <Link
              data-ph-element={AUTH_TRACKER_ELEMENTS.NAVIGATE_TO_SIGN_UP}
              href={authContentMap[type].linkHref}
              className="text-body-sm-semibold text-accent-primary hover:underline"
            >
              {authContentMap[type].linkText}
            </Link>
          </div>
        )
      }
    />
  );
});

type TAuthHeaderBase = {
  pageTitle: string;
  additionalAction?: React.ReactNode;
};

export function AuthHeaderBase(props: TAuthHeaderBase) {
  const { pageTitle, additionalAction } = props;
  return (
    <>
      <PageHead title={pageTitle + " - Avião"} />
      <div className="sticky top-0 flex w-full flex-shrink-0 items-center justify-between gap-6">
        <Link href="/">
          <img src={AviaoLockup} alt="Avião" className="h-6 w-auto text-primary" />
        </Link>
        {additionalAction}
      </div>
    </>
  );
}
