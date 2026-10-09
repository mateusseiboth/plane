/**
 * Respostas falsas do gateway para desenvolver sem a plataforma. Mude à vontade:
 * cada chave é a rota depois de /api/v1/widget-sdk.
 */
const agora = new Date().toISOString();

const chamado = (sequencia: number, nome: string, etapa: string) => ({
  id: `chamado-${sequencia}`,
  sequence_id: sequencia,
  name: nome,
  priority: "medium",
  state: { id: `etapa-${etapa}`, name: etapa, group: "started" },
  assignees: [],
  labels: [],
  entity_id: null,
  project_id: "sistema-1",
  workspace_id: "espaco-1",
  created_at: agora,
  updated_at: agora,
  completed_at: null,
});

const ROTAS: Record<string, unknown> = {
  "/users/me": {
    id: "pessoa-1",
    email: "ana@empresa.com.br",
    display_name: "ana",
    first_name: "Ana",
    last_name: "Souza",
    avatar_url: null,
  },
  "/stats/overview": {
    worker_items_total: 128,
    worker_items_open: 17,
    worker_items_closed: 111,
    intakes_total: 9,
    actions_total: 128,
  },
  "/worker-items": {
    data: [
      chamado(42, "Erro ao emitir guia de recolhimento", "Em atendimento"),
      chamado(41, "Importação do SPED parou no meio", "Em atendimento"),
      chamado(39, "Dúvida sobre o fechamento da folha", "Aguardando cliente"),
    ],
    page: 0,
    total: 3,
    total_pages: 1,
  },
};

export const readDadosDeTeste = (rota: string): unknown => ROTAS[rota.replace(/\/$/, "")];
