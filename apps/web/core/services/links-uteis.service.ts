/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Links úteis do espaço (portal, chat do cliente, trabalhe conosco, painéis de
// TV, integrações). Contrato em apps/api-ts/src/modules/links-uteis e
// `.claude/links-uteis.md`.
//
// A API devolve CAMINHO relativo: o endereço completo é montado na tela, com a
// origem em que ela está aberta (ver components/links-uteis/helpers.ts).

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

/** Trecho que a pessoa preenche ou escolhe antes de copiar o link. */
export type TCampoDoLink = {
  rotulo: string;
  exemplo: string;
  prefixo: string;
  sufixo: string;
  /** Vazio = campo livre. */
  opcoes: { valor: string; rotulo: string }[];
};

export type TCartaoDeLink = {
  chave: string;
  titulo: string;
  descricao: string;
  quemUsa: string;
  caminho: string;
  campo: TCampoDoLink | null;
  aviso: string | null;
};

export type TGrupoDeLinks = { chave: string; titulo: string; cartoes: TCartaoDeLink[] };

const rethrow = (err: any) => {
  throw err?.response?.data;
};

export class LinksUteisService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(slug: string): Promise<TGrupoDeLinks[]> {
    return this.get(`/api/workspaces/${slug}/links-uteis/`)
      .then((res) => (res?.data?.grupos ?? []) as TGrupoDeLinks[])
      .catch(rethrow);
  }
}

const linksUteisService = new LinksUteisService();
export default linksUteisService;
