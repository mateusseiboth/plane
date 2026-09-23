/**
 * Gestão de plugins em Configurações do espaço de trabalho.
 *
 * Listar, enviar bundle, ligar/desligar, remover e a grade de permissões por
 * função. Tudo protegido por `plugin.manage` (ver .claude/plugins.md).
 *
 * Precisa de uma API rodando contra o banco de teste (API_BASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { seedWorkflowRoles } from "@utils/permissions";
import { prismaReal } from "@tests/helpers/prisma-real";
import { cleanDb } from "@tests/helpers/setup";
import {
  TEST_API_BASE_URL,
  apiClient,
  createApiToken,
  createMemberWithToken,
  createUser,
  createWorkspace,
} from "@tests/helpers/factory";

type Client = ReturnType<typeof apiClient>;

const SLUG_DO_PLUGIN = "gestao-de-plugins-contrato";

const makePluginZip = (version: string): Blob => {
  const manifest = JSON.stringify({
    name: "Plugin da gestão",
    slug: SLUG_DO_PLUGIN,
    version,
    author: "Quality Sistemas",
    description: "Plugin de contrato da tela de gestão.",
    entry: "plugin.js",
    permissions: ["entities.read", "ui.pages"],
    definedPermissions: [
      { key: `${SLUG_DO_PLUGIN}.view`, label: "Visualizar", description: "Ver o painel." },
      { key: `${SLUG_DO_PLUGIN}.admin`, label: "Administrar" },
    ],
    configSchema: [
      { key: "enabled", label: "Habilitar", type: "boolean", default: false },
      { key: "token", label: "Token", type: "secret" },
    ],
  });
  const zipped = zipSync({
    "manifest.json": strToU8(manifest),
    "plugin.js": strToU8(`export default function Plugin() { return "${version}"; }`),
  });
  return new Blob([zipped], { type: "application/zip" });
};

describe("gestão de plugins (Configurações do espaço)", () => {
  let slug: string;
  let wsId: string;
  let admin: Client;
  let adminToken: string;
  let membroToken: string;
  let pluginId: string;
  let roleDoTi: { id: string; level: number };

  const gestao = (caminho: string) => `/workspaces/${slug}/plugins${caminho}`;

  const enviar = (token: string, version: string, caminho = gestao("/")) => {
    const form = new FormData();
    form.append("file", makePluginZip(version), "plugin.zip");
    return fetch(`${TEST_API_BASE_URL}/api/v1${caminho}`, {
      method: "POST",
      headers: { "X-Api-Key": token },
      body: form,
    });
  };

  beforeAll(async () => {
    await cleanDb();
    const dono = await createUser();
    const ws = await createWorkspace(dono.id);
    slug = ws.slug;
    wsId = ws.id;
    await seedWorkflowRoles(prismaReal(), ws.id);
    adminToken = (await createApiToken(dono.id)).token;
    admin = apiClient(adminToken);

    // Membro comum (15): opera no espaço, mas não gerencia plugins.
    membroToken = (await createMemberWithToken(ws.id, 15)).token;

    const ti = await prismaReal().workflowRole.findFirst({ where: { workspaceId: ws.id, key: "ti" } });
    roleDoTi = { id: ti!.id, level: ti!.level };
  });

  afterAll(() => cleanDb());

  describe("quem não tem plugin.manage", () => {
    it("não lista, não envia, não liga, não remove e não vê as permissões", async () => {
      const membro = apiClient(membroToken);
      expect((await membro.get(gestao("/"))).status).toBe(403);
      expect((await enviar(membroToken, "1.0.0")).status).toBe(403);
      expect((await membro.post(gestao("/00000000-0000-0000-0000-000000000000/toggle/"), {})).status).toBe(403);
      expect((await membro.get(gestao("/00000000-0000-0000-0000-000000000000/grants/"))).status).toBe(403);
      expect((await membro.delete(gestao("/00000000-0000-0000-0000-000000000000/"))).status).toBe(403);
    });
  });

  describe("envio do bundle", () => {
    it("a lista começa vazia", async () => {
      const res = await admin.get(gestao("/"));
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).results).toEqual([]);
    });

    it("envia o .zip e o plugin aparece na lista, ligado", async () => {
      const res = await enviar(adminToken, "1.0.0");
      expect(res.status).toBe(201);
      const criado = (await res.json()) as any;
      pluginId = criado.id;

      const lista = (await (await admin.get(gestao("/"))).json()) as any;
      expect(lista.results).toHaveLength(1);
      expect(lista.results[0]).toMatchObject({
        id: pluginId,
        name: "Plugin da gestão",
        slug: SLUG_DO_PLUGIN,
        version: "1.0.0",
        description: "Plugin de contrato da tela de gestão.",
        is_active: true,
        status: "ACTIVE",
      });
      expect(lista.results[0].created_at).toBeTruthy();
      expect(lista.results[0].defined_permissions.map((p: any) => p.key)).toEqual([
        `${SLUG_DO_PLUGIN}.view`,
        `${SLUG_DO_PLUGIN}.admin`,
      ]);
      expect(lista.results[0].has_config).toBe(true);
    });

    it("versão maior atualiza o mesmo cadastro", async () => {
      const res = await enviar(adminToken, "1.1.0");
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).version).toBe("1.1.0");
    });

    it("versão igual ou menor volta com o erro no campo do arquivo", async () => {
      const res = await enviar(adminToken, "1.1.0");
      expect(res.status).toBe(409);
      const corpo = (await res.json()) as any;
      expect(corpo.errors).toHaveLength(1);
      expect(corpo.errors[0].path).toBe("file");
      expect(corpo.errors[0].message).toContain("1.1.0");
    });

    it("envio sem arquivo volta com o erro no campo", async () => {
      const res = await fetch(`${TEST_API_BASE_URL}/api/v1${gestao("/")}`, {
        method: "POST",
        headers: { "X-Api-Key": adminToken },
        body: new FormData(),
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).errors).toEqual([
        { path: "file", message: "Escolha o arquivo .zip do plugin." },
      ]);
    });

    it("a rota global de envio aceita a sessão de quem tem plugin.manage", async () => {
      // O dono não é admin de instância nem do grupo TI: o que o autoriza é a ação.
      const dono = await prismaReal().user.findFirst({ where: { isInstanceAdmin: true } });
      expect(dono).toBeNull();
      const res = await enviar(adminToken, "1.2.0", "/plugins/");
      expect(res.status).toBe(200);
      expect(((await res.json()) as any).version).toBe("1.2.0");
    });
  });

  describe("ligar e desligar", () => {
    it("desliga e liga de novo", async () => {
      const desligado = await admin.post(gestao(`/${pluginId}/toggle/`), { is_active: false });
      expect(desligado.status).toBe(200);
      expect((await desligado.json()) as any).toMatchObject({ is_active: false, status: "INACTIVE" });

      const ativos = (await (await admin.get("/plugins/active")).json()) as any;
      expect(ativos.results).toEqual([]);

      const ligado = await admin.post(gestao(`/${pluginId}/toggle/`), { is_active: true });
      expect((await ligado.json()) as any).toMatchObject({ is_active: true, status: "ACTIVE" });
    });

    it("plugin inexistente é 404", async () => {
      const res = await admin.post(gestao("/00000000-0000-0000-0000-000000000000/toggle/"), { is_active: true });
      expect(res.status).toBe(404);
    });
  });

  describe("permissões por função", () => {
    it("traz as funções do espaço e as permissões do manifesto, sem nada concedido", async () => {
      const res = await admin.get(gestao(`/${pluginId}/grants/`));
      expect(res.status).toBe(200);
      const corpo = (await res.json()) as any;
      expect(corpo.permissions.map((p: any) => p.key)).toEqual([`${SLUG_DO_PLUGIN}.view`, `${SLUG_DO_PLUGIN}.admin`]);
      expect(corpo.roles.map((r: any) => r.key)).toContain("ti");
      expect(corpo.grants).toEqual({});
    });

    it("grava a grade e repetir a mesma gravação não duplica nada", async () => {
      const corpo = { grants: { [roleDoTi.id]: [`${SLUG_DO_PLUGIN}.view`] } };
      const primeira = await admin.put(gestao(`/${pluginId}/grants/`), corpo);
      expect(primeira.status).toBe(200);
      expect(((await primeira.json()) as any).grants).toEqual({ [roleDoTi.id]: [`${SLUG_DO_PLUGIN}.view`] });

      await admin.put(gestao(`/${pluginId}/grants/`), corpo);
      const linhas = await prismaReal().pluginPermissionGrant.findMany({
        where: { pluginId, workspaceId: wsId },
      });
      expect(linhas).toHaveLength(1);
      expect(linhas[0]).toMatchObject({
        subjectType: "role",
        subjectId: String(roleDoTi.level),
        permission: `${SLUG_DO_PLUGIN}.view`,
      });
    });

    it("tirar a marcação apaga a concessão", async () => {
      const res = await admin.put(gestao(`/${pluginId}/grants/`), { grants: { [roleDoTi.id]: [] } });
      expect(((await res.json()) as any).grants).toEqual({});
      expect(await prismaReal().pluginPermissionGrant.count({ where: { pluginId } })).toBe(0);
    });

    it("permissão fora do manifesto volta com o erro na linha da função", async () => {
      const res = await admin.put(gestao(`/${pluginId}/grants/`), {
        grants: { [roleDoTi.id]: ["outro-plugin.admin"] },
      });
      expect(res.status).toBe(400);
      const corpo = (await res.json()) as any;
      expect(corpo.errors).toEqual([
        { path: `grants.${roleDoTi.id}`, message: "Permissão desconhecida: outro-plugin.admin." },
      ]);
    });

    it("função de outro espaço volta com o erro na linha dela", async () => {
      const res = await admin.put(gestao(`/${pluginId}/grants/`), {
        grants: { "00000000-0000-0000-0000-000000000000": [] },
      });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).errors).toEqual([
        { path: "grants.00000000-0000-0000-0000-000000000000", message: "Função não encontrada neste espaço." },
      ]);
    });
  });

  describe("configuração do plugin", () => {
    it("quem tem plugin.manage lê e grava pela rota do gateway", async () => {
      const gw = (caminho: string, init?: RequestInit) =>
        fetch(`${TEST_API_BASE_URL}/api/v1/plugin-sdk${caminho}`, {
          ...init,
          headers: {
            "X-Api-Key": adminToken,
            "X-Plugin-Id": pluginId,
            "Content-Type": "application/json",
            ...init?.headers,
          },
        });

      const esquema = (await (await gw("/config/schema")).json()) as any[];
      expect(esquema.map((f) => f.key)).toEqual(["enabled", "token"]);

      const gravado = await gw(`/config?workspace_slug=${slug}`, {
        method: "PUT",
        body: JSON.stringify({ scope: "workspace", workspace_slug: slug, values: { enabled: true, token: "abc" } }),
      });
      expect(gravado.status).toBe(200);

      const lido = (await (await gw(`/config?scope=workspace&workspace_slug=${slug}`)).json()) as any;
      // Campo secreto nunca volta em claro.
      expect(lido).toEqual({ enabled: true, token: "***" });
    });
  });

  describe("remoção", () => {
    it("remove e some da lista", async () => {
      expect((await admin.delete(gestao(`/${pluginId}/`))).status).toBe(204);
      const lista = (await (await admin.get(gestao("/"))).json()) as any;
      expect(lista.results).toEqual([]);
    });
  });
});
