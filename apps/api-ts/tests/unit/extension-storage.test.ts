/**
 * Drivers de storage de extensões (plugins e widgets). Ambos seguem o mesmo
 * contrato — put/get/delete/getUrl — e hoje só existe o driver de disco local.
 */
import {afterAll, beforeAll, describe, expect, it} from "bun:test";
import {rm} from "fs/promises";
import {pluginStorage} from "@utils/plugin-storage";
import {widgetStorage} from "@utils/widget-storage";

// As raízes vêm do preload (tests/helpers/setup.ts), que roda antes de qualquer
// import — os módulos de storage resolvem a pasta no topo do arquivo.
const PLUGIN_ROOT = process.env.PLUGIN_STORAGE_ROOT!;
const WIDGET_ROOT = process.env.WIDGET_STORAGE_ROOT!;

const drivers = [
  {label: "pluginStorage", storage: pluginStorage, urlPrefix: "/api/v1/plugins/assets/"},
  {label: "widgetStorage", storage: widgetStorage, urlPrefix: "/api/v1/widgets/assets/"},
] as const;

describe.each(drivers)("$label", ({storage, urlPrefix}) => {
  afterAll(async () => {
    await rm(PLUGIN_ROOT, {recursive: true, force: true});
    await rm(WIDGET_ROOT, {recursive: true, force: true});
  });

  it("grava e lê de volta, criando os diretórios intermediários", async () => {
    const key = `slug/1.0.0/bundle.js`;
    await storage.put(key, Buffer.from("export default 1"));
    expect((await storage.get(key)).toString()).toBe("export default 1");
  });

  it("sobrescreve a mesma chave", async () => {
    const key = `slug/1.0.1/bundle.js`;
    await storage.put(key, Buffer.from("v1"));
    await storage.put(key, Buffer.from("v2"));
    expect((await storage.get(key)).toString()).toBe("v2");
  });

  it("apaga a chave e tolera apagar duas vezes", async () => {
    const key = `slug/1.0.2/bundle.js`;
    await storage.put(key, Buffer.from("x"));
    await storage.delete(key);
    await storage.delete(key); // no-op
    await expect(storage.get(key)).rejects.toThrow();
  });

  it("monta a URL pública servida pela API", () => {
    expect(storage.getUrl("slug/1.0.0/bundle.js")).toBe(`${urlPrefix}slug/1.0.0/bundle.js`);
  });

  it("get de uma chave inexistente rejeita", async () => {
    await expect(storage.get("nao/existe.js")).rejects.toThrow();
  });
});

describe("seleção de driver", () => {
  it("expõe o contrato completo do driver", () => {
    for (const {storage} of drivers) {
      for (const method of ["put", "get", "delete", "getUrl"] as const) {
        expect(typeof storage[method]).toBe("function");
      }
    }
  });
});
