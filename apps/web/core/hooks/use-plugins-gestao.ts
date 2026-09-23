/**
 * Plugins instalados, grade de permissões e configuração (Configurações do
 * espaço). SWR, como o resto das telas de configuração.
 */
import useSWR from "swr";
import pluginsService, {
  type TCampoDeConfiguracao,
  type TGradeDoPlugin,
  type TPluginInstalado,
} from "@/services/plugins.service";

export function usePluginsInstalados(workspaceSlug: string, habilitado: boolean) {
  const { data, error, isLoading, mutate } = useSWR<TPluginInstalado[]>(
    habilitado && workspaceSlug ? ["PLUGINS_INSTALADOS", workspaceSlug] : null,
    () => pluginsService.list(workspaceSlug)
  );
  return { plugins: data ?? [], error, isLoading, refetch: mutate };
}

export function useGradeDoPlugin(workspaceSlug: string, pluginId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<TGradeDoPlugin>(
    workspaceSlug && pluginId ? ["PLUGIN_GRANTS", workspaceSlug, pluginId] : null,
    () => pluginsService.grants(workspaceSlug, pluginId!)
  );
  return { grade: data, error, isLoading, refetch: mutate };
}

export type TConfiguracaoDoPlugin = { schema: TCampoDeConfiguracao[]; values: Record<string, unknown> };

export function useConfiguracaoDoPlugin(workspaceSlug: string, pluginId: string | null, habilitado: boolean) {
  const { data, error, isLoading, mutate } = useSWR<TConfiguracaoDoPlugin>(
    habilitado && workspaceSlug && pluginId ? ["PLUGIN_CONFIG", workspaceSlug, pluginId] : null,
    async () => {
      const [schema, values] = await Promise.all([
        pluginsService.configSchema(pluginId!),
        pluginsService.config(workspaceSlug, pluginId!),
      ]);
      return { schema, values };
    }
  );
  return { configuracao: data, error, isLoading, refetch: mutate };
}
