/**
 * Recorte dos gateways de plugin e widget: toda consulta é presa ao workspace
 * informado e, para chamados, aos projetos de que o usuário participa (a mesma
 * regra da listagem de chamados do workspace). Também o segredo da ponte de
 * plugins. Regra pura, sem banco.
 */
import { describe, expect, it } from "bun:test";
import { readBridgeSecret } from "@modules/plugin-sdk-gateway/bridge-secret";
import {
  buildEntityScopeWhere,
  buildIntakeScopeWhere,
  buildIssueScopeWhere,
  buildUserScopeWhere,
  readWorkspaceSlug,
  WorkspaceSlugRequiredError,
} from "@utils/sdk-gateway-scope";

const SCOPE = { workspaceId: "ws-1", projectIds: ["p-1", "p-2"] };

describe("readWorkspaceSlug", () => {
  it("devolve o slug informado", () => {
    expect(readWorkspaceSlug({ workspace_slug: "quality" })).toBe("quality");
  });

  it("sem slug, recusa com 400", () => {
    expect(() => readWorkspaceSlug({})).toThrow(WorkspaceSlugRequiredError);
    expect(() => readWorkspaceSlug(undefined)).toThrow(WorkspaceSlugRequiredError);
    expect(() => readWorkspaceSlug({ workspace_slug: "  " })).toThrow(WorkspaceSlugRequiredError);
    expect(new WorkspaceSlugRequiredError().status).toBe(400);
  });
});

describe("filtros de escopo", () => {
  it("chamado: workspace + projetos do membro", () => {
    expect(buildIssueScopeWhere(SCOPE)).toEqual({ workspaceId: "ws-1", projectId: { in: ["p-1", "p-2"] } });
  });

  it("triagem: workspace + projetos do membro", () => {
    expect(buildIntakeScopeWhere(SCOPE)).toEqual({ workspaceId: "ws-1", projectId: { in: ["p-1", "p-2"] } });
  });

  it("entidade: só o workspace", () => {
    expect(buildEntityScopeWhere(SCOPE)).toEqual({ workspaceId: "ws-1" });
  });

  it("usuário: só quem é membro ativo do workspace", () => {
    expect(buildUserScopeWhere(SCOPE)).toEqual({
      workspaceMembers: { some: { workspaceId: "ws-1", isActive: true, deletedAt: null } },
    });
  });
});

describe("readBridgeSecret", () => {
  it("lê PLUGIN_BRIDGE_SECRET", () => {
    expect(readBridgeSecret({ PLUGIN_BRIDGE_SECRET: "segredo" })).toBe("segredo");
  });

  it("sem a variável, não há segredo (nada de valor padrão)", () => {
    expect(readBridgeSecret({})).toBeNull();
    expect(readBridgeSecret({ PLUGIN_BRIDGE_SECRET: "   " })).toBeNull();
  });
});
