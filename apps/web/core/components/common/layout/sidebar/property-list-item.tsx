/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type TSidebarPropertyListItemProps = {
  icon: React.FC<{ className?: string }>;
  label: string;
  children: ReactNode;
  appendElement?: ReactNode;
  childrenClassName?: string;
};

export function SidebarPropertyListItem(props: TSidebarPropertyListItemProps) {
  const { icon: Icon, label, children, appendElement, childrenClassName } = props;

  return (
    <div className="flex items-start gap-2">
      {/* A coluna do rótulo tem largura fixa. Os termos em português são mais
          longos que os originais em inglês ("Data de vencimento" x "Due date"):
          sem `truncate` o texto vazava da caixa e cobria o valor ao lado. */}
      <div className="flex h-7.5 w-36 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
        <Icon className="size-4 shrink-0" />
        <span className="truncate" title={label}>
          {label}
        </span>
        {appendElement}
      </div>
      <div className={cn("flex grow flex-wrap items-center gap-1", childrenClassName)}>{children}</div>
    </div>
  );
}
