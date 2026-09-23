/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { MuralHomeSection } from "@/components/mural/home-section";
import { AtividadeDaHome } from "@/components/home/painel/atividade";
import { ChamadosPorSistema } from "@/components/home/painel/chamados-por-sistema";
import { DetalhesDaHome } from "@/components/home/painel/detalhes";
import { PerfilDaHome } from "@/components/home/painel/perfil";
import { SerieDeChamados } from "@/components/home/painel/serie-de-chamados";
import { TarefasDaHome } from "@/components/home/painel/tarefas";
// local imports
import type { TWidgetDaHome } from "@/components/home/grade/tipos";

/**
 * Catálogo dos widgets nativos da home. A ORDEM daqui é o layout padrão (o que
 * "Restaurar padrão" devolve e o que quem nunca mexeu vê). Widget nativo novo é
 * uma entrada a mais: ele aparece no fim da grade de quem já organizou a sua.
 * A chave é gravada nas preferências de cada pessoa: não renomeie.
 */
export const WIDGETS_NATIVOS: TWidgetDaHome[] = [
  {
    chave: "mural",
    titulo: "Mural de recados",
    descricao: "Os recados novos do espaço.",
    tamanhoPadrao: "1/1",
    origem: "nativo",
    componente: MuralHomeSection,
  },
  {
    chave: "meus_chamados",
    titulo: "Meus chamados",
    descricao: "Abertos e encerrados por dia, na semana, no mês ou no trimestre.",
    tamanhoPadrao: "2/3",
    origem: "nativo",
    componente: SerieDeChamados,
  },
  {
    chave: "perfil",
    titulo: "Perfil",
    descricao: "Seu papel e os números do mês.",
    tamanhoPadrao: "1/3",
    origem: "nativo",
    componente: PerfilDaHome,
  },
  {
    chave: "tarefas",
    titulo: "Tarefas",
    descricao: "Seus chamados abertos com prazo.",
    tamanhoPadrao: "2/3",
    origem: "nativo",
    componente: TarefasDaHome,
  },
  {
    chave: "chamados_por_sistema",
    titulo: "Chamados por sistema",
    descricao: "Em que sistemas estão os chamados abertos no período.",
    tamanhoPadrao: "1/3",
    origem: "nativo",
    componente: ChamadosPorSistema,
  },
  {
    chave: "atividade",
    titulo: "Atividade",
    descricao: "O que você fez nos chamados.",
    tamanhoPadrao: "2/3",
    origem: "nativo",
    componente: AtividadeDaHome,
  },
  {
    chave: "detalhes",
    titulo: "Detalhes",
    descricao: "Entrada no espaço, equipe, sistemas, último acesso e gestor.",
    tamanhoPadrao: "1/3",
    origem: "nativo",
    componente: DetalhesDaHome,
  },
];
