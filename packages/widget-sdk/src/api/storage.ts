let _widgetId = "";

export function configureStorage(widgetId: string) {
  _widgetId = widgetId;
}

function key(k: string) {
  return `widget:${_widgetId}:${k}`;
}

/**
 * Armazenamento local do widget no navegador (localStorage), separado por
 * widget: chaves de um widget não colidem com as de outro. Fica só neste
 * navegador; não é sincronizado entre aparelhos. Não precisa de permissão.
 */
export const storageApi = {
  /**
   * Grava um valor (serializado em JSON). Cota cheia é ignorada em silêncio.
   * @param k Chave, sem prefixo.
   * @param value Qualquer valor serializável em JSON.
   * @example
   * storageApi.set("filtro", { status: "started" });
   */
  set(k: string, value: unknown): void {
    try {
      localStorage.setItem(key(k), JSON.stringify(value));
    } catch {
      // Cota do localStorage cheia: o widget segue sem guardar.
    }
  },

  /**
   * Lê um valor gravado.
   * @param k Chave, sem prefixo.
   * @returns O valor, ou null se não existe ou não é JSON válido.
   * @example
   * const filtro = storageApi.get<{ status: string }>("filtro");
   */
  get<T = unknown>(k: string): T | null {
    try {
      const raw = localStorage.getItem(key(k));
      return raw !== null ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  /**
   * Apaga uma chave.
   * @param k Chave, sem prefixo.
   * @example
   * storageApi.remove("filtro");
   */
  remove(k: string): void {
    localStorage.removeItem(key(k));
  },

  /**
   * Apaga todas as chaves deste widget, sem tocar nas de outros.
   * @example
   * storageApi.clear();
   */
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
