/**
 * O SDK de widget manda o workspace atual em toda chamada ao gateway: as rotas de
 * dados exigem `workspace_slug`. `fetch` substituído por um dublê.
 */
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { entitiesApi } from "../src/api/entities";
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
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const slugs = () => chamadas.map((c) => new URL(c).searchParams.get("workspace_slug"));

describe("workspace atual", () => {
  it("lista e busca por id recebem o workspace atual", async () => {
    initializeSDK({ baseUrl: "http://host", widgetId: "w-1", workspaceSlug: "quality" });
    await workerItemsApi.find();
    await entitiesApi.findById("e-1");
    expect(slugs()).toEqual(["quality", "quality"]);
  });

  it("o workspace informado na chamada prevalece", async () => {
    initializeSDK({ baseUrl: "http://host", widgetId: "w-1", workspaceSlug: "quality" });
    await workerItemsApi.find({ workspace_slug: "outro" });
    expect(slugs()).toEqual(["outro"]);
  });

  it("sem workspace configurado, nada é inventado", async () => {
    initializeSDK({ baseUrl: "http://host", widgetId: "w-1" });
    await workerItemsApi.find();
    expect(slugs()).toEqual([null]);
  });
});
