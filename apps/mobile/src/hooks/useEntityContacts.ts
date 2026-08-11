/**
 * Cadastro de Contatos visto pelas telas de visita técnica: os contatos ativos
 * da entidade, os tipos disponíveis e o cadastro rápido de quem recebeu a
 * equipe e ainda não estava no sistema.
 */
import { useCallback } from "react";

import { endpoints, EntityContact, EntityContactDraft, EntityContactType } from "@/api";
import { normalizeContactDraft } from "@/utils/visit-contacts";
import { useAsync } from "./useAsync";

/**
 * Tipos ativos, na ordem definida no servidor. O padrão é o tipo de "usuário do
 * sistema": é ele que descreve quem opera o sistema na ponta, o caso comum de
 * quem recebe o técnico na entidade.
 */
export function useEntityContactTypes(slug?: string) {
  const request = useAsync<EntityContactType[]>(
    () => (slug ? endpoints.entityContacts.types(slug) : Promise.resolve([])),
    [slug],
  );
  const types = request.data ?? [];
  const preferred = types.find((t) => t.is_system_user) ?? types[0];
  return { types, defaultTypeId: preferred?.id ?? null, loading: request.loading };
}

export function useEntityContacts(slug?: string, entityId?: string | null) {
  const { types, defaultTypeId } = useEntityContactTypes(slug);

  const request = useAsync<EntityContact[]>(
    () =>
      slug
        ? endpoints.entityContacts.list(slug, { entity_id: entityId ?? undefined, is_active: true })
        : Promise.resolve([]),
    [slug, entityId],
  );
  const { refetch } = request;

  const create = useCallback(
    async (draft: EntityContactDraft): Promise<EntityContact> => {
      if (!slug) throw new Error("Nenhum espaço de trabalho selecionado.");
      const created = await endpoints.entityContacts.create(slug, {
        ...normalizeContactDraft(draft),
        entity_id: draft.entity_id ?? entityId ?? null,
      });
      refetch();
      return created;
    },
    [slug, entityId, refetch],
  );

  return {
    contacts: request.data ?? [],
    types,
    defaultTypeId,
    loading: request.loading,
    error: request.error,
    refetch,
    create,
  };
}
