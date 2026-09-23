/**
 * Service do painel da página inicial: série de abertos x encerrados, tarefas
 * com prazo, métricas do mês com o ranking, chamados por sistema, cartão da
 * pessoa e a atividade dela. A rota só resolve o espaço e a sessão; o contrato
 * snake_case que a tela consome sai daqui. Dependências injetadas para o teste.
 */
import type { ChamadoResumido, EscopoDaPessoa, PainelDao } from "@modules/home/painel.dao";
import {
  CAMPOS_DA_ATIVIDADE,
  classifyAtividade,
  fillSerie,
  mergeEventos,
  rankPosicao,
  resolveJanelaDaSerie,
  resolveMesCorrente,
  type PeriodoDaSerie,
  type TipoDeEvento,
} from "@modules/home/painel.rules";
import { round, userName } from "@modules/reports/comum/filtros";
import { formatNumeroDoChamado } from "@utils/numero-do-chamado";
import { defaultRoleForLevel } from "@utils/permissions";
import { vencimento } from "@utils/serialize";

export type PainelDeps = { dao: PainelDao; now: () => Date };

const LIMITE_DE_TAREFAS = 50;
const LIMITE_DE_SISTEMAS = 8;
const LIMITE_DE_ATIVIDADE = 30;
const TAMANHO_DA_CITACAO = 280;

const serializeChamado = (c: ChamadoResumido) => ({
  id: c.id,
  name: c.name,
  numero: formatNumeroDoChamado(c),
  sequence_id: c.sequenceId,
  project_id: c.projectId,
  project_identifier: c.project.identifier,
  project_name: c.project.name,
});

export type EventoDaAtividade = {
  id: string;
  tipo: TipoDeEvento;
  criado_em: string;
  chamado: ReturnType<typeof serializeChamado>;
  etapa?: string | null;
  comentario?: string;
};

/** Texto do comentário sem HTML, cortado para caber no cartão da citação. */
const buildCitacao = (texto: string, html: string) => {
  const limpo = (texto || html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return limpo.length > TAMANHO_DA_CITACAO ? `${limpo.slice(0, TAMANHO_DA_CITACAO - 1)}…` : limpo;
};

export function createPainelService({ dao, now }: PainelDeps) {
  const findSerie = async (escopo: EscopoDaPessoa, periodo: PeriodoDaSerie) => {
    const janela = resolveJanelaDaSerie(periodo, now());
    const [abertos, encerrados] = await Promise.all([
      dao.countAbertosPorDia(escopo, janela),
      dao.countEncerradosPorDia(escopo, janela),
    ]);
    const dias = fillSerie(janela.dias, abertos, encerrados);
    return {
      periodo,
      dias,
      total_abertos: dias.reduce((t, d) => t + d.abertos, 0),
      total_encerrados: dias.reduce((t, d) => t + d.encerrados, 0),
    };
  };

  const findTarefas = async (escopo: EscopoDaPessoa) => {
    const tarefas = await dao.findTarefas(escopo, LIMITE_DE_TAREFAS);
    const etapas = await dao.findEtapasDeConclusao([...new Set(tarefas.map((t) => t.projectId))]);
    // A lista vem por `sequence`: a primeira de cada sistema é a que vale.
    const conclusaoPorSistema = new Map<string, string>();
    for (const etapa of etapas.toReversed()) conclusaoPorSistema.set(etapa.projectId, etapa.id);
    return tarefas.map((t) =>
      Object.assign(serializeChamado(t), {
        priority: t.priority,
        target_date: vencimento(t.targetDate),
        entity_name: t.entity?.name ?? null,
        state_name: t.state?.name ?? null,
        completed_state_id: conclusaoPorSistema.get(t.projectId) ?? null,
      })
    );
  };

  const findMetricasDoMes = async (escopo: EscopoDaPessoa) => {
    const mes = resolveMesCorrente(now());
    const [porPessoa, em_aberto, horas] = await Promise.all([
      dao.countEncerradosPorPessoa(escopo.workspaceId, mes),
      dao.countEmAberto(escopo),
      dao.avgHorasDeResolucao(escopo, mes),
    ]);
    return {
      encerrados: porPessoa.find((p) => p.pessoaId === escopo.userId)?.total ?? 0,
      em_aberto,
      tempo_medio_resolucao_horas: round(horas, 1),
      ranking: rankPosicao(porPessoa, escopo.userId),
    };
  };

  const findChamadosPorSistema = async (escopo: EscopoDaPessoa, periodo: PeriodoDaSerie) => {
    const grupos = await dao.countAbertosPorSistema(escopo, resolveJanelaDaSerie(periodo, now()));
    const maiores = grupos.toSorted((a, b) => b._count.id - a._count.id).slice(0, LIMITE_DE_SISTEMAS);
    const projetos = new Map((await dao.findProjetos(maiores.map((g) => g.projectId))).map((p) => [p.id, p]));
    const sistemas = maiores.map((g) => ({
      project_id: g.projectId,
      project_name: projetos.get(g.projectId)?.name ?? "",
      project_identifier: projetos.get(g.projectId)?.identifier ?? "",
      total: g._count.id,
    }));
    return { periodo, sistemas };
  };

  const findPerfil = async (escopo: EscopoDaPessoa) => {
    const [pessoa, vinculo, sistemas, ultimoLogin] = await Promise.all([
      dao.findPessoa(escopo.userId),
      dao.findVinculoNoEspaco(escopo),
      dao.findSistemasDaPessoa(escopo),
      dao.findUltimoLogin(escopo.userId),
    ]);
    return {
      id: escopo.userId,
      nome: userName(pessoa),
      display_name: pessoa?.displayName ?? "",
      email: pessoa?.email ?? "",
      avatar_url: pessoa?.avatarUrl || pessoa?.avatar || null,
      papel: vinculo?.workflowRole?.name ?? defaultRoleForLevel(vinculo?.role ?? 5).name,
      equipe: vinculo?.companyRole?.trim() || null,
      entrou_em: vinculo?.createdAt.toISOString() ?? null,
      sistemas: sistemas.map((s) => s.project),
      ultimo_acesso: ultimoLogin?.toISOString() ?? null,
      // Não há gestor cadastrado no vínculo; a tela omite a linha quando vem nulo.
      gestor: null,
    };
  };

  const findEventosDaTrilha = async (escopo: EscopoDaPessoa, limite: number): Promise<EventoDaAtividade[]> => {
    const trilha = await dao.findTrilhaDaPessoa(escopo, CAMPOS_DA_ATIVIDADE, limite);
    const etapas = trilha.filter((t) => t.field === "state" && t.newValue);
    const grupos = await dao.findGruposDasEtapas(
      [...new Set(etapas.map((t) => t.projectId))],
      [...new Set(etapas.map((t) => t.newValue as string))]
    );
    const grupoDa = new Map(grupos.map((g) => [`${g.projectId}:${g.name}`, g.group]));
    return trilha.flatMap((t) => {
      const tipo = classifyAtividade(t, grupoDa.get(`${t.projectId}:${t.newValue}`) ?? null);
      if (!tipo) return [];
      const etapa = t.field === "state" ? { etapa: t.newValue } : {};
      return [{ id: t.id, tipo, criado_em: t.createdAt.toISOString(), chamado: serializeChamado(t.issue), ...etapa }];
    });
  };

  const findEventosDosComentarios = async (escopo: EscopoDaPessoa, limite: number): Promise<EventoDaAtividade[]> =>
    (await dao.findComentariosDaPessoa(escopo, limite)).map((c) => ({
      id: c.id,
      tipo: "comentario",
      criado_em: c.createdAt.toISOString(),
      chamado: serializeChamado(c.issue),
      comentario: buildCitacao(c.commentStripped, c.commentHtml),
    }));

  const findAtividade = async (escopo: EscopoDaPessoa, limitePedido: unknown) => {
    const limite = Math.min(Math.max(Number(limitePedido) || LIMITE_DE_ATIVIDADE, 1), LIMITE_DE_ATIVIDADE);
    const fontes = await Promise.all([findEventosDaTrilha(escopo, limite), findEventosDosComentarios(escopo, limite)]);
    return mergeEventos(fontes, limite);
  };

  return { findSerie, findTarefas, findMetricasDoMes, findChamadosPorSistema, findPerfil, findAtividade };
}
