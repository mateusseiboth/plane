/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import {useTheme} from "next-themes";
// plane imports
import {useTranslation} from "@plane/i18n";
// assets
import githubBlackImage from "@/app/assets/logos/github-black.png?url";
import githubWhiteImage from "@/app/assets/logos/github-white.png?url";

export function StarUsOnGitHubLink() {
  // plane hooks
  const {t} = useTranslation();
  // hooks
  const {resolvedTheme} = useTheme();
  const imageSrc = resolvedTheme === "dark" ? githubWhiteImage : githubBlackImage;

  return null;
}
