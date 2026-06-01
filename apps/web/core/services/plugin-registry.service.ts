import { API_BASE_URL } from "@plane/constants";
import { pluginService, type IPlugin } from "@/services/plugin.service";

class PluginRegistryService {
  private cache = new Map<string, IPlugin>();

  async fetchPlugin(id: string): Promise<IPlugin> {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const plugin = await pluginService.getById(id);
    this.cache.set(id, plugin);
    return plugin;
  }

  resolveAssetUrl(plugin: { id: string; entry_file: string }, filename?: string): string {
    const file = filename ?? plugin.entry_file;
    return `${API_BASE_URL}/api/v1/plugins/${plugin.id}/assets/${file}`;
  }

  clearCache(id?: string) {
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }
}

export const pluginRegistry = new PluginRegistryService();
