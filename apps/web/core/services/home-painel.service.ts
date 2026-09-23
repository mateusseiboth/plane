/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TPeriodoDoPainel = "semana" | "mes" | "trimestre";

export type TPontoDaSerie = { data: string; abertos: number; encerrados: number };

export type TSerieDeChamados = {
  periodo: TPeriodoDoPainel;
  dias: TPontoDaSerie[];
  total_abertos: number;
  total_encerrados: number;
};

export type TChamadoDoPainel = {
  id: string;
  name: string;
  /** Número anual ("12-2026"); nulo enquanto o chamado não foi numerado. */
  numero: string | null;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  project_name: string;
};

export type TTarefaDaHome = TChamadoDoPainel & {
  entity_name: string | null;
  priority: string;
  target_date: string | null;
  state_name: string | null;
  /** Etapa de conclusão do sistema: para onde o checkbox leva o chamado. */
  completed_state_id: string | null;
};

export type TRankingDoMes = { posicao: number | null; total_pessoas: number };

export type TMetricasDoMes = {
  encerrados: number;
  em_aberto: number;
  tempo_medio_resolucao_horas: number | null;
  ranking: TRankingDoMes;
};

export type TSistemaDoPainel = {
  project_id: string;
  project_name: string;
  project_identifier: string;
  total: number;
};

export type TChamadosPorSistema = { periodo: TPeriodoDoPainel; sistemas: TSistemaDoPainel[] };

export type TPerfilDaHome = {
  id: string;
  nome: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  papel: string;
  equipe: string | null;
  entrou_em: string | null;
  sistemas: { id: string; name: string; identifier: string }[];
  ultimo_acesso: string | null;
  gestor: string | null;
};

export type TTipoDeEvento = "abertura" | "etapa" | "conclusao" | "comentario" | "solicitacao_atendida";

export type TEventoDaHome = {
  id: string;
  tipo: TTipoDeEvento;
  criado_em: string;
  chamado: TChamadoDoPainel;
  etapa?: string | null;
  comentario?: string;
};

/**
 * Painel da página inicial: cada cartão tem a sua rota, para carregar e
 * falhar sozinho, sem prender a tela inteira no cartão mais lento.
 */
class HomePainelService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private read<T>(slug: string, rota: string, params?: Record<string, string | number>): Promise<T> {
    return this.get(`/api/workspaces/${slug}/home/${rota}/`, { params }).then((r) => r?.data as T);
  }

  serie(slug: string, periodo: TPeriodoDoPainel) {
    return this.read<TSerieDeChamados>(slug, "serie-de-chamados", { periodo });
  }

  tarefas(slug: string) {
    return this.read<TTarefaDaHome[]>(slug, "tarefas");
  }

  metricasDoMes(slug: string) {
    return this.read<TMetricasDoMes>(slug, "metricas-do-mes");
  }

  chamadosPorSistema(slug: string, periodo: TPeriodoDoPainel) {
    return this.read<TChamadosPorSistema>(slug, "chamados-por-sistema", { periodo });
  }

  perfil(slug: string) {
    return this.read<TPerfilDaHome>(slug, "perfil");
  }

  atividade(slug: string, limit = 12) {
    return this.read<TEventoDaHome[]>(slug, "atividade", { limit });
  }
}

export const homePainelService = new HomePainelService();
