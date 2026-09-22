/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { checkEmailValidity } from "@plane/utils";

// Mesma regra do api-ts (modules/auth): com @ é e-mail; sem @, nome de usuário.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,60}$/;

export function isLoginIdentifierValid(value: string): boolean {
  const identifier = value.trim();
  return identifier.includes("@") ? checkEmailValidity(identifier) : USERNAME_RE.test(identifier);
}
