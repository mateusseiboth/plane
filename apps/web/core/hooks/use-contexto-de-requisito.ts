/**
 * Contexto que acompanha todo pedido à IA de levantamento de requisitos:
 * projeto e entidade (cliente/órgão) resolvidos por nome, porque o modelo lê
 * texto e não conhece UUID.
 *
 * Ambos saem de caches que a tela já mantém — nenhuma chamada nova.
 */
import { useProject } from "@/hooks/store/use-project";
import { useEntities } from "@/hooks/use-entities";

type TParametros = {
  workspaceSlug: string | undefined;
  projectId: string | null | undefined;
  entityId?: string | null;
};

export const useContextoDeRequisito = (params: TParametros) => {
  const { workspaceSlug, projectId, entityId } = params;
  const { getProjectById } = useProject();
  const { entities } = useEntities(workspaceSlug);

  const projeto = projectId ? getProjectById(projectId)?.name : undefined;
  const entidade = entityId ? entities?.find((entidade) => entidade.id === entityId)?.name : undefined;

  return { projeto, entidade };
};
