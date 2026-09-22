/**
 * Escopo das rotas de dados dos gateways de extensão (`/plugin-sdk` e `/widget-sdk`).
 *
 * Toda rota de dados exige `workspace_slug` e que o usuário seja membro ativo do
 * workspace. Chamado e triagem ainda ficam presos aos projetos de que o usuário
 * participa, a mesma visibilidade da listagem de chamados do workspace
 * (`GET /workspaces/:slug/issues/`). Sem isso, um plugin lia dados de qualquer
 * workspace da instância, bastando omitir o slug ou pedir um registro pelo id.
 */
import { findMemberProjectIds, getWorkspaceOrFail, requireWorkspaceMember } from "@utils/workspace";

export interface ISdkGatewayScope {
  workspaceId: string;
  projectIds: string[];
}

export class WorkspaceSlugRequiredError extends Error {
  readonly status = 400;

  constructor() {
    super("Informe o workspace_slug.");
    this.name = new.target.name;
  }
}

export const readWorkspaceSlug = (query: unknown): string => {
  const slug = String((query as { workspace_slug?: unknown } | undefined)?.workspace_slug ?? "").trim();
  if (!slug) throw new WorkspaceSlugRequiredError();
  return slug;
};

/** Workspace do slug + checagem de membro. Lança 404 (workspace) ou 403 (não membro). */
export const requireMemberWorkspaceId = async (slug: string, userId: string): Promise<string> => {
  const ws = await getWorkspaceOrFail(slug);
  await requireWorkspaceMember(ws.id, userId);
  return ws.id;
};

/** Para rota de dados: `workspace_slug` obrigatório, membro, e os projetos visíveis. */
export const requireSdkGatewayScope = async (query: unknown, userId: string): Promise<ISdkGatewayScope> => {
  const workspaceId = await requireMemberWorkspaceId(readWorkspaceSlug(query), userId);
  return { workspaceId, projectIds: await findMemberProjectIds(workspaceId, userId) };
};

/** Para rota em que o workspace é opcional (permissões, config de instância, proxy). */
export const resolveOptionalWorkspaceId = async (query: unknown, userId: string): Promise<string | null> => {
  const slug = String((query as { workspace_slug?: unknown } | undefined)?.workspace_slug ?? "").trim();
  if (!slug) return null;
  return requireMemberWorkspaceId(slug, userId);
};

export const buildIssueScopeWhere = (scope: ISdkGatewayScope) => ({
  workspaceId: scope.workspaceId,
  projectId: { in: scope.projectIds },
});

export const buildIntakeScopeWhere = buildIssueScopeWhere;

export const buildEntityScopeWhere = (scope: ISdkGatewayScope) => ({ workspaceId: scope.workspaceId });

export const buildUserScopeWhere = (scope: ISdkGatewayScope) => ({
  workspaceMembers: { some: { workspaceId: scope.workspaceId, isActive: true, deletedAt: null } },
});
