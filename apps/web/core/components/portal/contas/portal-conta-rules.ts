/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Regras de tela das contas do portal do cliente. Puro e testado
 * (`portal-conta-rules.test.ts`); a API confere tudo de novo.
 */

/** A conta como a API devolve (`GET /workspaces/:slug/portal-accounts/`). */
export type TPortalConta = {
  id: string;
  name: string;
  email: string;
  entity_id: string | null;
  entity: { id: string; name: string } | null;
  is_active: boolean;
  last_login_at: string | null;
  project_ids: string[];
  created_at: string | null;
};

export type TPortalContaForm = {
  name: string;
  email: string;
  /** Na edição, em branco mantém a senha atual. */
  password: string;
  entity_id: string | null;
  project_ids: string[];
  is_active: boolean;
};

export type TPortalContaPayload = Omit<TPortalContaForm, "password"> & { password?: string };

export type TSituacaoDaConta = "todas" | "ativas" | "inativas";

export function buildContaForm(conta?: TPortalConta | null): TPortalContaForm {
  return {
    name: conta?.name ?? "",
    email: conta?.email ?? "",
    password: "",
    entity_id: conta?.entity_id ?? null,
    project_ids: conta?.project_ids ?? [],
    is_active: conta?.is_active ?? true,
  };
}

export function buildContaPayload(form: TPortalContaForm, criando: boolean): TPortalContaPayload {
  const { password, ...resto } = form;
  const payload: TPortalContaPayload = { ...resto, name: form.name.trim(), email: form.email.trim() };
  if (criando || password) payload.password = password;
  return payload;
}

const withoutAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const FILTRO_POR_SITUACAO: Record<TSituacaoDaConta, (conta: TPortalConta) => boolean> = {
  todas: () => true,
  ativas: (conta) => conta.is_active,
  inativas: (conta) => !conta.is_active,
};

export function filterContas(contas: TPortalConta[], busca: string, situacao: TSituacaoDaConta): TPortalConta[] {
  const termo = withoutAcento(busca.trim());
  return contas.filter(
    (conta) =>
      FILTRO_POR_SITUACAO[situacao](conta) &&
      withoutAcento(`${conta.name} ${conta.email} ${conta.entity?.name ?? ""}`).includes(termo)
  );
}

export function readUltimoAcesso(lastLoginAt: string | null): string {
  if (!lastLoginAt) return "Nunca entrou";
  return new Date(lastLoginAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
