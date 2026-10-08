/**
 * Configurações > Membros: trocar a função e remover alguém precisam endereçar a
 * PESSOA (id do usuário), que é o `:pk` de `/workspaces/:slug/members/:pk/` no
 * api-ts. O store mandava o id da associação; a API não achava ninguém,
 * respondia 200 e, ao recarregar, a função antiga voltava.
 * Rodar com `bun test core/store/member`.
 */
import { describe, expect, it } from "bun:test";
import { WorkspaceMemberStore } from "@/store/member/workspace/workspace-member.store";

const SLUG = "quality";
const USUARIO = "usuario-fabiane";
const ASSOCIACAO = "associacao-fabiane";

const buildStore = () => {
  const chamadas: { metodo: string; slug: string; id: string; data?: unknown }[] = [];
  const store = new WorkspaceMemberStore(
    { memberMap: { [USUARIO]: { id: USUARIO, display_name: "fabiane" } } } as any,
    { router: { workspaceSlug: SLUG }, user: { data: { id: "dono" } } } as any
  );
  store.workspaceService = {
    updateWorkspaceMember: async (slug: string, id: string, data: unknown) => {
      chamadas.push({ metodo: "update", slug, id, data });
    },
    deleteWorkspaceMember: async (slug: string, id: string) => {
      chamadas.push({ metodo: "delete", slug, id });
    },
  } as any;
  store.workspaceMemberMap = { [SLUG]: { [USUARIO]: { id: ASSOCIACAO, member: USUARIO, role: 8, is_active: true } } };
  return { store, chamadas };
};

describe("WorkspaceMemberStore", () => {
  it("troca a função pelo id do usuário, não pelo da associação", async () => {
    const { store, chamadas } = buildStore();
    await store.updateMember(SLUG, USUARIO, { role: 18 as any });
    expect(chamadas).toEqual([{ metodo: "update", slug: SLUG, id: USUARIO, data: { role: 18 } }]);
    expect(store.workspaceMemberMap[SLUG][USUARIO].role).toBe(18 as any);
  });

  it("devolve a função antiga na tela quando a API recusa", async () => {
    const { store } = buildStore();
    store.workspaceService = {
      updateWorkspaceMember: async () => {
        throw { detail: "Pessoa não encontrada neste espaço de trabalho." };
      },
    } as any;
    await expect(store.updateMember(SLUG, USUARIO, { role: 18 as any })).rejects.toBeDefined();
    expect(store.workspaceMemberMap[SLUG][USUARIO].role).toBe(8 as any);
  });

  it("remove pelo id do usuário", async () => {
    const { store, chamadas } = buildStore();
    await store.removeMemberFromWorkspace(SLUG, USUARIO);
    expect(chamadas).toEqual([{ metodo: "delete", slug: SLUG, id: USUARIO }]);
    expect(store.workspaceMemberMap[SLUG][USUARIO].is_active).toBe(false);
  });
});
