/**
 * Segredo compartilhado entre a plataforma e o backend de cada plugin: a chave de
 * cada plugin é `HMAC(PLUGIN_BRIDGE_SECRET, pluginId)`. Não há valor padrão: um
 * segredo conhecido publicamente deixaria qualquer um forjar a identidade assinada
 * em que o backend do plugin confia. Sem a variável, o proxy responde 503.
 */
export const readBridgeSecret = (env: Record<string, string | undefined> = process.env): string | null =>
  env.PLUGIN_BRIDGE_SECRET?.trim() || null;
