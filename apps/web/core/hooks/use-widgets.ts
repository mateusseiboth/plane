import { useEffect } from "react";
import { useLocalObservable } from "mobx-react";
import { widgetStore } from "@/store/widget.store";

export function useWidgets(filters?: { name?: string; status?: string }) {
  const store = useLocalObservable(() => widgetStore);

  useEffect(() => {
    store.fetchWidgets(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    widgets: store.widgets,
    isLoading: store.isLoading,
    isUploading: store.isUploading,
    error: store.error,
    uploadWidget: store.uploadWidget.bind(store),
    activateWidget: store.activateWidget.bind(store),
    deactivateWidget: store.deactivateWidget.bind(store),
    removeWidget: store.removeWidget.bind(store),
    updateWidget: store.updateWidget.bind(store),
    refetch: () => store.fetchWidgets(filters),
  };
}
