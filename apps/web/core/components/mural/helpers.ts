/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TMuralAnexo, TMuralRecadoPayload } from "@/services/mural.service";

/** Ação da matriz que libera publicar, editar, inativar e ver quem leu. */
export const MURAL_PUBLISH = "mural.publish";

export type TMuralFiltros = {
  desde?: string;
  ate?: string;
  inactive?: boolean;
  cursor?: string;
  perPage?: number;
};

const PARAMETROS: Record<keyof TMuralFiltros, string> = {
  desde: "desde",
  ate: "ate",
  inactive: "inactive",
  cursor: "cursor",
  perPage: "per_page",
};

/** Filtros do histórico na query string; vazio e `false` ficam de fora. */
export function buildMuralQuery(filtros: TMuralFiltros): string {
  const params = new URLSearchParams();
  (Object.keys(PARAMETROS) as (keyof TMuralFiltros)[])
    .filter((chave) => !!filtros[chave])
    .forEach((chave) => params.set(PARAMETROS[chave], String(filtros[chave])));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export type TRecadoForm = {
  title: string;
  description_html: string;
  is_pinned: boolean;
  is_required: boolean;
  /** `YYYY-MM-DD` do `<input type="date">`; a API lê como fim do dia. */
  expires_at: string;
  attachment_id: string;
  attachment_name: string;
};

export const MURAL_FORM_VAZIO: TRecadoForm = {
  title: "",
  description_html: "<p></p>",
  is_pinned: false,
  is_required: false,
  expires_at: "",
  attachment_id: "",
  attachment_name: "",
};

type TRecadoEditavel = {
  title: string;
  description_html: string;
  is_pinned: boolean;
  is_required: boolean;
  expires_at: string | null;
  attachment: TMuralAnexo | null;
};

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Data do instante no fuso de quem está na tela, no formato do campo de data. */
const toCampoDeData = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
};

export function toRecadoForm(recado: TRecadoEditavel | null | undefined): TRecadoForm {
  if (!recado) return MURAL_FORM_VAZIO;
  return {
    title: recado.title,
    description_html: recado.description_html,
    is_pinned: recado.is_pinned,
    is_required: recado.is_required,
    expires_at: toCampoDeData(recado.expires_at),
    attachment_id: recado.attachment?.id ?? "",
    attachment_name: recado.attachment?.name ?? "",
  };
}

/**
 * HTML com que o editor monta. Sai do MESMO estado que vira payload: o que a
 * tela mostra é o que vai para a API. O editor não monta com conteúdo vazio,
 * então o recado novo começa num parágrafo em branco.
 */
export const editorInicial = (form: TRecadoForm): string => form.description_html || "<p></p>";

export function buildRecadoPayload(form: TRecadoForm): TMuralRecadoPayload {
  return {
    title: form.title.trim(),
    description_html: form.description_html,
    is_pinned: form.is_pinned,
    is_required: form.is_required,
    expires_at: form.expires_at || null,
    attachment_id: form.attachment_id || null,
  };
}

/** `errors: [{path, message}]` da API vira mapa campo → mensagem, para marcar o campo. */
export function getFieldErrors(erro: unknown): Record<string, string> {
  const lista = (erro as { errors?: unknown } | null | undefined)?.errors;
  if (!Array.isArray(lista)) return {};
  return Object.fromEntries(
    lista
      .filter((e): e is { path: string; message: string } => typeof e?.path === "string")
      .map((e) => [e.path, e.message])
  );
}

/** Recado obrigatório a mostrar agora: o primeiro pendente ainda não confirmado nesta sessão. */
export function getAvisoAtual<T extends { id: string }>(pendentes: T[] | undefined, confirmados: Set<string>) {
  return pendentes?.find((r) => !confirmados.has(r.id));
}

export const isMuralEvent = (event: { entity: string }) => event.entity === "mural";
