import { API_BASE_URL } from "@plane/constants";
import { widgetService, type IWidget } from "@/services/widget.service";

class WidgetRegistryService {
  private cache = new Map<string, IWidget>();

  async fetchWidget(id: string): Promise<IWidget> {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const widget = await widgetService.getById(id);
    this.cache.set(id, widget);
    return widget;
  }

  resolveAssetUrl(widget: IWidget, filename?: string): string {
    const file = filename ?? widget.entry_file;
    return `${API_BASE_URL}/api/v1/widgets/${widget.id}/assets/${file}`;
  }

  clearCache(id?: string) {
    if (id) this.cache.delete(id);
    else this.cache.clear();
  }
}

export const widgetRegistry = new WidgetRegistryService();
