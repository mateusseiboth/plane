/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { PaginaDeReferenciaDosWidgets } from "@/components/developers/widgets/pagina-de-referencia";

export default function WidgetDocsPage() {
  const { workspaceSlug } = useParams();

  return (
    <>
      <PageHead title="Widgets: referência para desenvolvedores" />
      <PaginaDeReferenciaDosWidgets workspaceSlug={workspaceSlug?.toString() ?? ""} />
    </>
  );
}
