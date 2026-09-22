/**
 * Upload de plugin: cadastro, atualização de versão, recusa de versão igual ou
 * menor e reenvio depois de excluir. API de verdade + banco de teste.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { apiClient, createApiToken, createUser, TEST_API_BASE_URL } from "@tests/helpers/factory";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";

const SLUG = "plugin-upload-contrato";

const makePluginZip = (version: string): Blob => {
  const manifest = JSON.stringify({
    name: "Plugin de contrato",
    slug: SLUG,
    version,
    author: "Tester",
    entry: "plugin.js",
    permissions: ["worker-items.read"],
  });
  const zipped = zipSync({
    "manifest.json": strToU8(manifest),
    "plugin.js": strToU8(`export default function Plugin() { return "${version}"; }`),
  });
  return new Blob([zipped], { type: "application/zip" });
};

describe("upload de plugin", () => {
  let apiToken: string;
  let client: ReturnType<typeof apiClient>;
  let pluginId: string;

  const upload = (version: string) => {
    const form = new FormData();
    form.append("file", makePluginZip(version), "plugin.zip");
    return fetch(`${TEST_API_BASE_URL}/api/v1/plugins/`, {
      method: "POST",
      headers: { "X-Api-Key": apiToken },
      body: form,
    });
  };

  beforeAll(async () => {
    await cleanDb();
    const user = await createUser();
    await prismaReal().user.update({ where: { id: user.id }, data: { isInstanceAdmin: true } });
    apiToken = (await createApiToken(user.id)).token;
    client = apiClient(apiToken);
  });

  afterAll(() => cleanDb());

  it("cadastra a primeira versão", async () => {
    const res = await upload("1.0.0");
    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.version).toBe("1.0.0");
    pluginId = data.id;
  });

  it("versão maior atualiza o mesmo plugin e grava a versão no histórico", async () => {
    const res = await upload("1.1.0");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBe(pluginId);
    expect(data.version).toBe("1.1.0");
    expect(data.storage_key).toBe(`${SLUG}/1.1.0/plugin.js`);

    const versoes = (await (await client.get(`/plugins/${pluginId}/versions`)).json()) as any[];
    expect(versoes.map((v) => v.version).toSorted()).toEqual(["1.0.0", "1.1.0"]);
  });

  it("serve o pacote da versão nova", async () => {
    const res = await client.get(`/plugins/${pluginId}/assets/plugin.js`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("1.1.0");
  });

  it("versão igual é recusada com 409", async () => {
    const res = await upload("1.1.0");
    expect(res.status).toBe(409);
    const data = (await res.json()) as any;
    expect(data.detail).toContain("1.1.0");
  });

  it("versão menor é recusada com 409", async () => {
    const res = await upload("1.0.5");
    expect(res.status).toBe(409);
  });

  it("depois de excluir, o reenvio reativa o mesmo cadastro", async () => {
    expect((await client.delete(`/plugins/${pluginId}`)).status).toBe(204);
    expect((await client.get(`/plugins/${pluginId}`)).status).toBe(404);

    const res = await upload("1.0.0");
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.id).toBe(pluginId);
    expect(data.version).toBe("1.0.0");
    expect(data.status).toBe("ACTIVE");

    const versoes = (await (await client.get(`/plugins/${pluginId}/versions`)).json()) as any[];
    expect(versoes.filter((v) => v.version === "1.0.0")).toHaveLength(1);
  });
});
