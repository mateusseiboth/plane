/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import Link from "next/link";
import { EAuthModes, PRIVACY_URL, TERMS_URL } from "@plane/constants";

interface TermsAndConditionsProps {
  authType?: EAuthModes;
}

// Constants for better maintainability
const LEGAL_LINKS = {
  termsOfService: TERMS_URL,
  privacyPolicy: PRIVACY_URL,
} as const;

const MESSAGES = {
  [EAuthModes.SIGN_UP]: "Ao criar uma conta",
  [EAuthModes.SIGN_IN]: "Ao entrar",
} as const;

// Reusable link component to reduce duplication
function LegalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-secondary" target="_blank" rel="noopener noreferrer">
      <span className="text-13 font-medium underline hover:cursor-pointer">{children}</span>
    </Link>
  );
}

export function TermsAndConditions({ authType = EAuthModes.SIGN_IN }: TermsAndConditionsProps) {
  return (
    <div className="flex items-center justify-center">
      <p className="text-center text-13 whitespace-pre-line text-tertiary">
        {`${MESSAGES[authType]}, você declara estar de acordo com os \n nossos `}
        <LegalLink href={LEGAL_LINKS.termsOfService}>Termos de serviço</LegalLink> e a{" "}
        <LegalLink href={LEGAL_LINKS.privacyPolicy}>Política de Privacidade</LegalLink>.
      </p>
    </div>
  );
}
