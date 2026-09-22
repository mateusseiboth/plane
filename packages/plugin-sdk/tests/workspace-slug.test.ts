/**
 * O SDK de plugin manda o workspace atual em toda chamada ao gateway. Sem isso,
 * `sdk.config.get()` (escopo workspace por padrão) recebia 400, e as rotas de dados,
 * que exigem `workspace_slug`, também. `fetch` substituído por um dublê.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { configApi } from "../src/api/config";
import { permissionsApi } from "../src/api/permissions";
import { workerItemsApi } from "../src/api/worker-items";
import { initializeSDK } from "../src/init";

const originalFetch = globalThis.fetch;
let chamadas: string[] = [];

beforeEach(() => {
  chamadas = [];
  globalThis.fetch = mock(async (url: string | URL | Request) => {
    chamadas.push(String(url));
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  permissionsApi.invalidate();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const lastQuery = () => new URL(chamadas.at(-1) ?? "").searchParams;

describe("workspace atual", () => {
  it("config.get() sem escopo envia o workspace atual", async () => {
    initializeSDK({ baseUrl: "http://host", pluginId: "p-1", workspaceSlug: "quality" });
    await configApi.get();
    expect(lastQuery().get("workspace_slug")).toBe("quality");
  });

  it("config.set() envia o workspace atual", async () => {
    initializeSDK({ baseUrl: "http://host", pluginId: "p-1", workspaceSlug: "quality" });
    await configApi.set({ a: 1 });
    expect(lastQuery().get("workspace_slug")).toBe("quality");
  });

  it("rotas de dados recebem o workspace atual", async () => {
    initializeSDK({ baseUrl: "http://host", pluginId: "p-1", workspaceSlug: "quality" });
    await workerItemsApi.find();
    await workerItemsApi.findById("i-1");
    expect(chamadas.map((c) => new URL(c).searchParams.get("workspace_slug"))).toEqual(["quality", "quality"]);
  });

  it("o workspace informado na chamada prevalece", async () => {
    initializeSDK({ baseUrl: "http://host", pluginId: "p-1", workspaceSlug: "quality" });
    await workerItemsApi.find({ workspace_slug: "outro" });
    expect(lastQuery().get("workspace_slug")).toBe("outro");
  });

  it("permissions.list() sem argumento usa o workspace atual", async () => {
    initializeSDK({ baseUrl: "http://host", pluginId: "p-1", workspaceSlug: "quality" });
    await permissionsApi.list();
    expect(lastQuery().get("workspace_slug")).toBe("quality");
  });

  it("sem workspace configurado, nada é inventado", async () => {
    initializeSDK({ baseUrl: "http://host", pluginId: "p-1" });
    await configApi.get("instance");
    expect(lastQuery().has("workspace_slug")).toBe(false);
  });
});
