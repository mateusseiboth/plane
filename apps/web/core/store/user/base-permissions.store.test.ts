/**
 * O que a tela mostra sai da matriz de ações (`GET /workspaces/:slug/roles/me/`:
 * função + exceções por pessoa), a mesma que o api-ts confere. O store guarda a
 * resposta por espaço e responde `canDo` para componentes e para outros stores
 * (páginas), sem lista fixa de nível de papel.
 * Rodar com `bun test core/store/user`.
 */
import { describe, expect, it } from "bun:test";
import { UserPermissionStore } from "@/plane-web/store/user/permission.store";

const SLUG = "quality";
const SISTEMA = "sistema-sac";

const buildStore = (permissions: string[]) => {
  const store = new UserPermissionStore({ router: { workspaceSlug: SLUG, projectId: SISTEMA } } as any);
  store.rolesService = {
    me: async () => ({ role: { id: "r", key: "qualidade", level: 8 }, permissions, granted: [], revoked: [] }),
  } as any;
  return store;
};

describe("BaseUserPermissionStore.canDo", () => {
  it("nega enquanto a matriz não chegou", () => {
    expect(buildStore(["issue.create"]).canDo("issue.create", SLUG)).toBe(false);
  });

  it("responde pela matriz depois de carregada", async () => {
    const store = buildStore(["issue.create", "intake.review"]);
    await store.fetchMyWorkspaceActions(SLUG);
    expect(store.canDo("intake.review", SLUG)).toBe(true);
    expect(store.canDo("project.create", SLUG)).toBe(false);
  });

  it("aceita lista (qualquer uma libera) e usa o espaço da rota quando não recebe", async () => {
    const store = buildStore(["posatendimento.verify"]);
    await store.fetchMyWorkspaceActions(SLUG);
    expect(store.canDo(["posatendimento.record", "posatendimento.verify"])).toBe(true);
  });

  it("no sistema, exige participar dele além da ação", async () => {
    const store = buildStore(["issue.create"]);
    await store.fetchMyWorkspaceActions(SLUG);
    expect(store.canDoInProject("issue.create", SLUG, SISTEMA)).toBe(false);
    store.workspaceProjectsPermissions = { [SLUG]: { [SISTEMA]: 8 } } as any;
    expect(store.canDoInProject("issue.create", SLUG, SISTEMA)).toBe(true);
    expect(store.canDoInProject("project.settings", SLUG, SISTEMA)).toBe(false);
  });
});
