/**
 * Formas de saída do registro de plugins. O contrato da API é snake_case (ver
 * .claude/plugins.md): devolver o objeto cru do Prisma quebraria os tipos do
 * frontend, que leem `entry_file`, `created_at` e companhia.
 */
import type { PluginConfigField, PluginDefinedPermission } from "@utils/plugin-manifest";

const manifestOf = (p: { manifest?: unknown }): Record<string, unknown> =>
  (p.manifest && typeof p.manifest === "object" ? p.manifest : {}) as Record<string, unknown>;

/** Permissões que o manifesto DECLARA (a grade papel × permissão da tela). */
export function readDefinedPermissions(p: { manifest?: unknown }): PluginDefinedPermission[] {
  const raw = manifestOf(p).definedPermissions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .filter((item) => typeof item.key === "string" && item.key.length > 0)
    .map((item) => ({
      key: item.key as string,
      label: typeof item.label === "string" ? item.label : (item.key as string),
      description: typeof item.description === "string" ? item.description : undefined,
    }));
}

/** Campos chave/valor que o manifesto declara (o formulário de configuração). */
export function readConfigSchema(p: { manifest?: unknown }): PluginConfigField[] {
  const raw = manifestOf(p).configSchema;
  return Array.isArray(raw) ? (raw as PluginConfigField[]) : [];
}

export function serializePlugin(p: any) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    version: p.version,
    author: p.author,
    entry_file: p.entryFile,
    manifest: p.manifest,
    permissions: p.permissions,
    contributions: p.contributions ?? { sidebar: [], pages: [] },
    status: p.status,
    storage_key: p.storageKey,
    created_by: p.createdById ?? null,
    created_at: p.createdAt?.toISOString(),
    updated_at: p.updatedAt?.toISOString(),
  };
}

/**
 * O que a tela de Configurações > Plugins desenha por linha. Sem o manifesto
 * bruto nem a chave de armazenamento: a lista não precisa deles, e o manifesto
 * de um plugin com backend traz a URL interna do serviço.
 */
export function serializePluginDaGestao(p: any) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? null,
    version: p.version,
    author: p.author,
    status: p.status,
    is_active: p.status === "ACTIVE",
    permissions: p.permissions ?? [],
    contributions: p.contributions ?? { sidebar: [], pages: [] },
    defined_permissions: readDefinedPermissions(p),
    has_config: readConfigSchema(p).length > 0,
    created_at: p.createdAt?.toISOString(),
    updated_at: p.updatedAt?.toISOString(),
  };
}
