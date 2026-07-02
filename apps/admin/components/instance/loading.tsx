/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// assets
import NewLogo from "@/app/assets/images/new-logo.png?url";

export function InstanceLoading() {
  return (
    <div className="flex items-center justify-center">
      <img src={NewLogo} alt="logo" className="h-6 w-auto object-contain sm:h-11" />
    </div>
  );
}
