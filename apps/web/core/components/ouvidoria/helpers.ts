/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// Regras puras das telas de ouvidoria, denúncia, currículos e lista de
// e-mails, e do passo "ação" no editor de fluxos do robô. Contrato em
// apps/api-ts/src/modules/{ouvidoria,denuncia,curriculo,contato-email} e
// `.claude/ouvidoria-denuncia-curriculos.md`.

/** Ações da matriz (`ACTION_CATALOG` do api-ts). Todas de Gestor e admin por padrão. */
export const ACOES = {
  OUVIDORIA_READ: "ouvidoria.read",
  DENUNCIA_READ: "denuncia.read",
  CURRICULO_READ: "curriculo.read",
  CONTATO_EXPORT: "contato.export",
} as const;

const toQuery = (pares: Array<[string, string | undefined]>): string => {
  const params = new URLSearchParams();
  pares.filter(([, valor]) => !!valor?.trim()).forEach(([chave, valor]) => params.set(chave, valor!.trim()));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

export type TOuvidoriaFiltros = { kind: string; read: string; cursor: string | undefined };

export const buildOuvidoriaQuery = (f: TOuvidoriaFiltros) =>
  toQuery([
    ["kind", f.kind],
    ["read", f.read],
    ["cursor", f.cursor],
  ]);

export type TCurriculoFiltros = { position: string; read: string; interviewed: string; cursor: string | undefined };

export const buildCurriculoQuery = (f: TCurriculoFiltros) =>
  toQuery([
    ["position", f.position],
    ["read", f.read],
    ["interviewed", f.interviewed],
    ["cursor", f.cursor],
  ]);

export type TContatoEmailFiltros = {
  entityId: string;
  entityType: string;
  projectIds: string[];
  isWithMembers: boolean;
};

export const buildContatoEmailQuery = (f: TContatoEmailFiltros) =>
  toQuery([
    ["entity_id", f.entityId],
    ["entity_type", f.entityType],
    ["project_ids", f.projectIds.join(",")],
    ["include_members", f.isWithMembers ? "true" : ""],
  ]);

/** Página 0 não leva cursor; as outras usam o formato `limite:página:0` da API. */
export const buildPaginaCursor = (porPagina: number, pagina: number) =>
  pagina ? `${porPagina}:${pagina}:0` : undefined;

/** Data e hora no fuso de quem está na tela. */
export const formatDataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";

/** `YYYY-MM-DD` (dia sem hora) em `dd/mm/aaaa`, sem passar por Date e sem fuso. */
export const formatDia = (dia: string) => dia.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2/$1");

/** Separador aceito no campo CCO do Outlook e do Gmail. */
export const formatEmailsParaCopiar = (emails: string[]) => emails.join("; ");

export const isOuvidoriaEvent = (event: { entity: string }) => event.entity === "ouvidoria";

// ── Passo "ação" do fluxo do robô ────────────────────────────────────────────

export type TPassoDeAcao = {
  type: string;
  destino?: string;
  params?: Record<string, string>;
  prompts?: Record<string, string>;
};

export type TMudancaDoPasso =
  | { destino: string }
  | { param: [chave: string, valor: string] }
  | { prompt: [campo: string, texto: string] };

const withoutVazios = (mapa: Record<string, string>) =>
  Object.fromEntries(Object.entries(mapa).filter(([, valor]) => valor.trim()));

/** Aplica uma mudança da tela ao passo. Trocar o destino zera o que era do anterior. */
export function updatePassoDeAcao(passo: TPassoDeAcao, mudanca: TMudancaDoPasso): TPassoDeAcao {
  if ("destino" in mudanca) return { type: "action", destino: mudanca.destino, params: {}, prompts: {} };
  if ("param" in mudanca) return { ...passo, params: { ...passo.params, [mudanca.param[0]]: mudanca.param[1] } };
  return { ...passo, prompts: withoutVazios({ ...passo.prompts, [mudanca.prompt[0]]: mudanca.prompt[1] }) };
}
