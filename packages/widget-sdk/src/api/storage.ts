let _widgetId = "";

export function configureStorage(widgetId: string) {
  _widgetId = widgetId;
}

function key(k: string) {
  return `widget:${_widgetId}:${k}`;
}

export const storageApi = {
  set(k: string, value: unknown): void {
    try {
      localStorage.setItem(key(k), JSON.stringify(value));
    } catch {
      // Storage quota exceeded — silently ignore
    }
  },

  get<T = unknown>(k: string): T | null {
    try {
      const raw = localStorage.getItem(key(k));
      return raw !== null ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  remove(k: string): void {
    localStorage.removeItem(key(k));
  },

  clear(): void {
    const prefix = `widget:${_widgetId}:`;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) keysToRemove.push(k);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  },
};
