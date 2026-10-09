import type { WidgetPermission } from "../contrato";

/** Página de uma listagem do gateway. A numeração começa em 0. */
export interface PaginatedResponse<T> {
  /** Itens da página. */
  data: T[];
  /** Número da página devolvida, a partir de 0. */
  page: number;
  /** Total de itens em todas as páginas. */
  total: number;
  /** Quantidade de páginas com o `limit` usado. */
  total_pages: number;
}

/** Etapa (estado) de um chamado. */
export interface WorkerItemState {
  /** Id da etapa. */
  id: string;
  /** Nome exibido da etapa, por exemplo "Em atendimento". */
  name: string;
  /** Grupo da etapa: backlog, unstarted, started, completed ou cancelled. */
  group: string;
}

/** Chamado, como o gateway devolve. */
export interface WorkerItem {
  /** Id do chamado. */
  id: string;
  /** Número sequencial do chamado dentro do sistema (o 42 de SUP-42). */
  sequence_id: number;
  /** Título do chamado. */
  name: string;
  /** Descrição em HTML, quando o gateway a inclui. */
  description_html?: string | null;
  /** Prioridade do chamado. */
  priority: "urgent" | "high" | "medium" | "low" | "none";
  /** Etapa atual, ou null quando não há etapa. */
  state: WorkerItemState | null;
  /** Responsáveis pelo chamado. */
  assignees: Array<{ id: string; display_name: string; email?: string }>;
  /** Etiquetas do chamado. */
  labels: Array<{ id: string; name: string; color: string }>;
  /** Entidade (cliente) do chamado, ou null. */
  entity_id: string | null;
  /** Sistema (projeto) do chamado. */
  project_id: string;
  /** Espaço do chamado. */
  workspace_id: string;
  /** Criação, em ISO 8601. */
  created_at: string;
  /** Última alteração, em ISO 8601. */
  updated_at: string;
  /** Conclusão, em ISO 8601, ou null se está aberto. */
  completed_at: string | null;
}

/** Filtros da listagem de chamados. Todos opcionais. */
export interface WorkerItemFilters {
  /** Espaço da consulta. Sem ele, vale o espaço em que o widget está aberto. */
  workspace_slug?: string;
  /** Só os chamados desta entidade (cliente). */
  entity_id?: string;
  /** Só os chamados com etapa deste grupo: backlog, unstarted, started, completed ou cancelled. */
  status?: string;
  /** Só os chamados deste responsável. */
  assignee_id?: string;
  /** Busca no título e no número do chamado. */
  search?: string;
  /** Página, a partir de 0. Padrão: 0. */
  page?: number;
  /** Itens por página. Padrão: 20; máximo: 100. */
  limit?: number;
}

/** Totais de chamados. */
export interface WorkerItemStats {
  /** Todos os chamados visíveis. */
  total: number;
  /** Chamados abertos. */
  open: number;
  /** Chamados concluídos ou cancelados. */
  closed: number;
  /** Quantidade por prioridade (urgent, high, medium, low, none). */
  by_priority: Record<string, number>;
}

/** Solicitação da triagem (intake). */
export interface Intake {
  /** Id da solicitação. */
  id: string;
  /** Título da solicitação. */
  name: string;
  /** Descrição em texto, ou null. */
  description: string | null;
  /** Sistema (projeto) da triagem. */
  project_id: string;
  /** Espaço da solicitação. */
  workspace_id: string;
  /** Criação, em ISO 8601. */
  created_at: string;
  /** Última alteração, em ISO 8601. */
  updated_at: string;
}

/** Filtros da listagem de solicitações. Todos opcionais. */
export interface IntakeFilters {
  /** Espaço da consulta. Sem ele, vale o espaço em que o widget está aberto. */
  workspace_slug?: string;
  /** Só as solicitações deste sistema (projeto). */
  project_id?: string;
  /** Reservado: o gateway ainda não filtra por situação. */
  status?: number;
  /** Página, a partir de 0. Padrão: 0. */
  page?: number;
  /** Itens por página. Padrão: 20; máximo: 100. */
  limit?: number;
}

/** Totais de solicitações. */
export interface IntakeStats {
  /** Todas as solicitações visíveis. */
  total: number;
}

/** Chamado na visão resumida de ações. */
export interface Action {
  /** Id do chamado. */
  id: string;
  /** Título do chamado. */
  name: string;
  /** Prioridade do chamado. */
  priority: string;
  /** Etapa atual, ou null. */
  state: WorkerItemState | null;
  /** Entidade (cliente) do chamado, ou null. */
  entity_id: string | null;
  /** Criação, em ISO 8601. */
  created_at: string;
  /** Última alteração, em ISO 8601. */
  updated_at: string;
}

/** Filtros da listagem de ações. Todos opcionais. */
export interface ActionFilters {
  /** Espaço da consulta. Sem ele, vale o espaço em que o widget está aberto. */
  workspace_slug?: string;
  /** Só as ações desta entidade (cliente). */
  entity_id?: string;
  /** Só as ações deste responsável. */
  assignee_id?: string;
  /** Página, a partir de 0. Padrão: 0. */
  page?: number;
  /** Itens por página. Padrão: 20; máximo: 100. */
  limit?: number;
}

/** Totais de ações. */
export interface ActionStats {
  /** Todas as ações visíveis. */
  total: number;
  /** Ações abertas. */
  open: number;
  /** Ações concluídas ou canceladas. */
  closed: number;
}

/** Visão geral do espaço. */
export interface StatsOverview {
  /** Todos os chamados visíveis. */
  worker_items_total: number;
  /** Chamados abertos. */
  worker_items_open: number;
  /** Chamados concluídos ou cancelados. */
  worker_items_closed: number;
  /** Solicitações da triagem. */
  intakes_total: number;
  /** Ações (chamados na visão resumida). */
  actions_total: number;
}

/** Totais de chamados de uma entidade. */
export interface EntityStats {
  /** Entidade consultada. */
  entity_id: string;
  /** Todos os chamados da entidade. */
  total: number;
  /** Chamados abertos. */
  open: number;
  /** Chamados concluídos ou cancelados. */
  closed: number;
}

/** Movimento de chamados num período. */
export interface PeriodStats {
  /** Início do período, como foi pedido. */
  start_date: string;
  /** Fim do período, como foi pedido. */
  end_date: string;
  /** Chamados criados no período. */
  worker_items_created: number;
  /** Chamados concluídos no período. */
  worker_items_completed: number;
}

/** Pessoa (membro do espaço ou a pessoa logada). */
export interface User {
  /** Id da pessoa. */
  id: string;
  /** E-mail. */
  email: string;
  /** Nome de exibição. */
  display_name: string;
  /** Primeiro nome. */
  first_name?: string;
  /** Sobrenome. */
  last_name?: string;
  /** Endereço da foto, ou null. */
  avatar_url: string | null;
}

/** Filtros da listagem de pessoas. Todos opcionais. */
export interface UserFilters {
  /** Busca no e-mail e no nome de exibição. */
  search?: string;
  /** Página, a partir de 0. Padrão: 0. */
  page?: number;
  /** Itens por página. Padrão: 20; máximo: 100. */
  limit?: number;
}

/** Entidade (cliente atendido). */
export interface Entity {
  /** Id da entidade. */
  id: string;
  /** Nome da entidade. */
  name: string;
  /** Código do tipo da entidade, ou null. */
  entity_type: number | null;
  /** Cidade, ou null. */
  city: string | null;
  /** UF, ou null. */
  state: string | null;
  /** Espaço da entidade. */
  workspace_id: string;
  /** Criação, em ISO 8601. */
  created_at: string;
}

/** Filtros da listagem de entidades. Todos opcionais. */
export interface EntityFilters {
  /** Espaço da consulta. Sem ele, vale o espaço em que o widget está aberto. */
  workspace_slug?: string;
  /** Busca no nome. */
  search?: string;
  /** Inclui entidades inativas e congeladas. Padrão: só as ativas. */
  include_inactive?: boolean;
  /** Página, a partir de 0. Padrão: 0. */
  page?: number;
  /** Itens por página. Padrão: 20; máximo: 100. */
  limit?: number;
}

/** Parâmetros de `statsApi.period`. */
export interface PeriodFilters {
  /** Início do período (AAAA-MM-DD). */
  start_date: string;
  /** Fim do período (AAAA-MM-DD). */
  end_date: string;
  /** Espaço da consulta. Sem ele, vale o espaço em que o widget está aberto. */
  workspace_slug?: string;
}

/** Configuração de `uiApi.modal`. */
export interface ModalConfig {
  /** Título do modal. */
  title: string;
  /** Conteúdo: texto ou elemento React. */
  content: React.ReactNode | string;
  /** Chamado quando o modal fecha. */
  onClose?: () => void;
  /** Largura do modal. Padrão: md. */
  size?: "sm" | "md" | "lg";
}

/** Configuração de `uiApi.drawer`. */
export interface DrawerConfig {
  /** Título da gaveta. */
  title: string;
  /** Conteúdo: texto ou elemento React. */
  content: React.ReactNode | string;
  /** Chamado quando a gaveta fecha. */
  onClose?: () => void;
  /** Lado em que a gaveta abre. Padrão: right. */
  position?: "left" | "right";
}

/** Configuração de `uiApi.confirm`. */
export interface ConfirmConfig {
  /** Título da confirmação. */
  title: string;
  /** Pergunta mostrada à pessoa. */
  message: string;
  /** Texto do botão de confirmar. Padrão: Confirmar. */
  confirmLabel?: string;
  /** Texto do botão de cancelar. Padrão: Cancelar. */
  cancelLabel?: string;
  /** Chamado quando a pessoa confirma. */
  onConfirm: () => void;
  /** Chamado quando a pessoa cancela. */
  onCancel?: () => void;
}

/** Opções de `initializeSDK`. A home já chama por você; use só em desenvolvimento e testes. */
export interface SDKInitOptions {
  /** Origem da plataforma, por exemplo `https://chamados.empresa.com.br`. */
  baseUrl: string;
  /** Id do widget, enviado no cabeçalho X-Widget-Id. */
  widgetId: string;
  /** Workspace em que o widget está aberto; vai como `workspace_slug` em toda chamada. */
  workspaceSlug?: string;
}

/** Tamanho de um widget na grade da página inicial, em fração da largura: 1/3, 1/2, 2/3 ou 1/1. */
export type WidgetSize = "1/3" | "1/2" | "2/3" | "1/1";

/**
 * Conteúdo do `manifest.json` do pacote. Campos de plugin (`slug`,
 * `contributions`, `configSchema`) não valem para widget: o envio os ignora.
 * @example
 * {
 *   "name": "Fila do suporte",
 *   "version": "1.0.0",
 *   "author": "Equipe de TI",
 *   "entry": "widget.js",
 *   "description": "Chamados em atendimento, do mais recente para o mais antigo.",
 *   "permissions": ["worker-items.read", "stats.read"],
 *   "title": "Fila do suporte",
 *   "defaultSize": "1/2"
 * }
 */
export interface WidgetManifest {
  /** Nome do widget. Junto com `version`, identifica o pacote: o mesmo par não entra duas vezes. Até 255 caracteres. */
  name: string;
  /** Versão semver `major.minor.patch`, só números (1.0.0). Outro formato recusa o pacote. */
  version: string;
  /** Quem fez o widget. Aparece no cartão e na administração. Até 255 caracteres. */
  author: string;
  /** Caminho, dentro do zip, do módulo ES com o componente React no export default. Ex.: widget.js. */
  entry: string;
  /** Uma frase sobre o widget, mostrada em Gerenciar widgets. */
  description?: string;
  /** Permissões pedidas ao gateway, entre as de WIDGET_PERMISSIONS. Permissão desconhecida recusa o pacote. */
  permissions?: WidgetPermission[];
  /** Título do cartão na home. Sem ele, vale o `name`. Até 80 caracteres. */
  title?: string;
  /** Tamanho com que o widget entra na grade: 1/3, 1/2, 2/3 ou 1/1. Sem ele, 1/2. Outro valor recusa o pacote. */
  defaultSize?: WidgetSize;
}

/** Props que a home entrega ao componente do widget. */
export interface WidgetHomeProps {
  /** Tamanho atual do cartão na grade, para o widget adaptar o conteúdo. */
  size: WidgetSize;
}

/** Retorno de todo hook de dados do SDK. */
export interface WidgetQueryResult<T> {
  /** O dado carregado, ou null enquanto carrega e quando falha. */
  data: T | null;
  /** true enquanto a consulta está em andamento. */
  loading: boolean;
  /** Mensagem do erro da última consulta, ou null. */
  error: string | null;
  /** Refaz a consulta com os mesmos parâmetros. */
  refetch: () => void;
}
