import { makeAutoObservable, runInAction } from "mobx";
import { pluginService, type IPlugin, type IActivePlugin } from "@/services/plugin.service";

export class PluginStore {
  plugins: IPlugin[] = [];
  activePlugins: IActivePlugin[] = [];
  isLoading = false;
  isUploading = false;
  hasFetchedActive = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async fetchPlugins(filters?: { name?: string; author?: string; status?: string }) {
    this.isLoading = true;
    this.error = null;
    try {
      const res = await pluginService.list(filters);
      runInAction(() => {
        this.plugins = res.results ?? [];
        this.isLoading = false;
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.detail ?? "Failed to load plugins.";
        this.isLoading = false;
      });
    }
  }

  async fetchActivePlugins() {
    try {
      const res = await pluginService.listActive();
      runInAction(() => {
        this.activePlugins = res.results ?? [];
        this.hasFetchedActive = true;
      });
    } catch {
      runInAction(() => {
        this.hasFetchedActive = true;
      });
    }
  }

  async uploadPlugin(file: File): Promise<IPlugin> {
    this.isUploading = true;
    this.error = null;
    try {
      const plugin = await pluginService.upload(file);
      runInAction(() => {
        this.plugins = [plugin, ...this.plugins];
        this.isUploading = false;
      });
      return plugin;
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.detail ?? "Upload failed.";
        this.isUploading = false;
      });
      throw e;
    }
  }

  async activatePlugin(id: string) {
    const plugin = await pluginService.activate(id);
    runInAction(() => {
      this.plugins = this.plugins.map((p) => (p.id === id ? plugin : p));
    });
    this.fetchActivePlugins();
  }

  async deactivatePlugin(id: string) {
    const plugin = await pluginService.deactivate(id);
    runInAction(() => {
      this.plugins = this.plugins.map((p) => (p.id === id ? plugin : p));
    });
    this.fetchActivePlugins();
  }

  async removePlugin(id: string) {
    await pluginService.remove(id);
    runInAction(() => {
      this.plugins = this.plugins.filter((p) => p.id !== id);
    });
    this.fetchActivePlugins();
  }

  async updatePlugin(id: string, data: { name?: string; description?: string }) {
    const plugin = await pluginService.update(id, data);
    runInAction(() => {
      this.plugins = this.plugins.map((p) => (p.id === id ? plugin : p));
    });
    return plugin;
  }
}

export const pluginStore = new PluginStore();
