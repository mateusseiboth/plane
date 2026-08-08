/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// As configurações de perfil só existem por aba (/settings/profile/:aba); o
// endereço "nu" caía no 404, e ele aparece em links copiados e no histórico.
//
// Precisa ser um ARQUIVO PRÓPRIO: `mergeRoutes` indexa as rotas pelo caminho do
// arquivo, então reaproveitar `profile-settings.tsx` (que atende /profile/*)
// faria uma das duas entradas desaparecer silenciosamente do manifesto.
import { redirect } from "react-router";

export const clientLoader = ({ request }: { request: Request }) => {
  const searchParams = new URL(request.url).searchParams.toString();
  throw redirect(`/settings/profile/general/${searchParams ? `?${searchParams}` : ""}`);
};

export default function SettingsProfileRedirect() {
  return null;
}
