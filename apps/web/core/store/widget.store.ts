import { makeAutoObservable, runInAction } from "mobx";
import { widgetService, type IWidget } from "@/services/widget.service";

export class WidgetStore {
  widgets: IWidget[] = [];
  isLoading = false;
  isUploading = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async fetchWidgets(filters?: { name?: string; author?: string; status?: string }) {
    this.isLoading = true;
    this.error = null;
    try {
      const res = await widgetService.list(filters);
      runInAction(() => {
        this.widgets = res.results ?? [];
        this.isLoading = false;
      });
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.detail ?? "Failed to load widgets.";
        this.isLoading = false;
      });
    }
  }

  async uploadWidget(file: File): Promise<IWidget> {
    this.isUploading = true;
    this.error = null;
    try {
      const widget = await widgetService.upload(file);
      runInAction(() => {
        this.widgets = [widget, ...this.widgets];
        this.isUploading = false;
      });
      return widget;
    } catch (e: any) {
      runInAction(() => {
        this.error = e?.response?.data?.detail ?? "Upload failed.";
        this.isUploading = false;
      });
      throw e;
    }
  }

  async activateWidget(id: string) {
    const widget = await widgetService.activate(id);
    runInAction(() => {
      this.widgets = this.widgets.map((w) => (w.id === id ? widget : w));
    });
  }

  async deactivateWidget(id: string) {
    const widget = await widgetService.deactivate(id);
    runInAction(() => {
      this.widgets = this.widgets.map((w) => (w.id === id ? widget : w));
    });
  }

  async removeWidget(id: string) {
    await widgetService.remove(id);
    runInAction(() => {
      this.widgets = this.widgets.filter((w) => w.id !== id);
    });
  }

  async updateWidget(id: string, data: { name?: string; description?: string }) {
    const widget = await widgetService.update(id, data);
    runInAction(() => {
      this.widgets = this.widgets.map((w) => (w.id === id ? widget : w));
    });
    return widget;
  }
}

export const widgetStore = new WidgetStore();
