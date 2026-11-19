/**
 * O recorte do chamado que a tela de detalhe guarda no store. É montado campo a
 * campo: o que não estiver aqui some do chamado depois que o detalhe carrega.
 * A entidade faltava, e o chamado aberto direto (faixa de urgentes, link da
 * notificação) mostrava "Adicionar entidade" mesmo tendo uma.
 */
import type { TIssue } from "@plane/types";

export const buildIssueDoDetalhe = (issue: TIssue): TIssue => ({
  id: issue?.id,
  sequence_id: issue?.sequence_id,
  name: issue?.name,
  description_html: issue?.description_html,
  sort_order: issue?.sort_order,
  state_id: issue?.state_id,
  priority: issue?.priority,
  label_ids: issue?.label_ids,
  assignee_ids: issue?.assignee_ids,
  estimate_point: issue?.estimate_point,
  sub_issues_count: issue?.sub_issues_count,
  attachment_count: issue?.attachment_count,
  link_count: issue?.link_count,
  project_id: issue?.project_id,
  parent_id: issue?.parent_id,
  cycle_id: issue?.cycle_id,
  module_ids: issue?.module_ids,
  type_id: issue?.type_id,
  created_at: issue?.created_at,
  updated_at: issue?.updated_at,
  start_date: issue?.start_date,
  target_date: issue?.target_date,
  completed_at: issue?.completed_at,
  archived_at: issue?.archived_at,
  created_by: issue?.created_by,
  updated_by: issue?.updated_by,
  is_draft: issue?.is_draft,
  is_subscribed: issue?.is_subscribed,
  is_epic: issue?.is_epic,
  ticket_number: issue?.ticket_number,
  legacy_ticket_number: issue?.legacy_ticket_number,
  // Só o GET de um chamado traz: o outro lado do "Alterar sistema" e a solicitação de origem.
  moved_to_issue: issue?.moved_to_issue,
  moved_from_issue: issue?.moved_from_issue,
  solicitacao: issue?.solicitacao,
  entity_id: issue?.entity_id,
  entity: issue?.entity,
  // Quem está vendo o detalhe acabou de abrir o chamado (ver markAsRead).
  is_unread: false,
});
