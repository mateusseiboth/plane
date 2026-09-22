/**
 * Sintético semanal do SAC (`chamados_semanais_sintetico.php` e
 * `listar_relatorio_semanal.php`): matriz responsável × sistema × tipo.
 *
 *  - concluídos: chamados do responsável cujo marco "finalizado TI" caiu no período;
 *  - pendentes: chamados do responsável em aberto que ainda não saíram do TI, isto é,
 *    em aberto e fora de "Em Teste" (retrato de agora, como no legado);
 *  - interações: comentários do responsável no período, pelo sistema do chamado.
 *
 * Chamado com mais de um responsável conta para cada um. Puro.
 */
import { STATE } from "@utils/permissions";
import { GRUPOS_ENCERRADOS } from "@modules/reports/marcos/marcos";
import { isNoPeriodo, type Periodo } from "@modules/reports/comum/periodo";
import {
  addAoTipo,
  createContagemPorTipo,
  type ContagemPorTipo,
  type TipoDoChamado,
} from "@modules/reports/comum/tipo-do-chamado";

export type ChamadoDoSintetico = {
  projetoId: string;
  tipo: TipoDoChamado;
  responsaveis: string[];
  etapa: string | null;
  grupo: string | null;
  finalizadoTiEm: Date | null;
};

export type InteracaoDoSintetico = { usuarioId: string; projetoId: string; total: number };

export type SistemaDoSintetico = {
  projetoId: string;
  interacoes: number;
  concluidos: ContagemPorTipo;
  pendentes: ContagemPorTipo;
};

export type LinhaDoSintetico = {
  usuarioId: string;
  sistemas: SistemaDoSintetico[];
  totais: { interacoes: number; concluidos: number; pendentes: number };
};

const isPendenteDoTi = (c: ChamadoDoSintetico) =>
  !GRUPOS_ENCERRADOS.includes(c.grupo ?? "") && c.etapa !== STATE.EM_TESTE;

type Matriz = Map<string, Map<string, SistemaDoSintetico>>;

function readCelula(matriz: Matriz, usuarioId: string, projetoId: string): SistemaDoSintetico {
  const sistemas = matriz.get(usuarioId) ?? new Map<string, SistemaDoSintetico>();
  matriz.set(usuarioId, sistemas);
  const celula = sistemas.get(projetoId) ?? {
    projetoId,
    interacoes: 0,
    concluidos: createContagemPorTipo(),
    pendentes: createContagemPorTipo(),
  };
  sistemas.set(projetoId, celula);
  return celula;
}

function addChamado(matriz: Matriz, chamado: ChamadoDoSintetico, periodo: Periodo): void {
  const concluido = isNoPeriodo(chamado.finalizadoTiEm, periodo);
  const pendente = isPendenteDoTi(chamado);
  if (!concluido && !pendente) return;
  for (const usuarioId of chamado.responsaveis) {
    const celula = readCelula(matriz, usuarioId, chamado.projetoId);
    if (concluido) addAoTipo(celula.concluidos, chamado.tipo);
    if (pendente) addAoTipo(celula.pendentes, chamado.tipo);
  }
}

const buildLinha = ([usuarioId, sistemas]: [string, Map<string, SistemaDoSintetico>]): LinhaDoSintetico => {
  const lista = [...sistemas.values()];
  return {
    usuarioId,
    sistemas: lista,
    totais: {
      interacoes: lista.reduce((s, c) => s + c.interacoes, 0),
      concluidos: lista.reduce((s, c) => s + c.concluidos.total, 0),
      pendentes: lista.reduce((s, c) => s + c.pendentes.total, 0),
    },
  };
};

export function buildSinteticoSemanal(params: {
  periodo: Periodo;
  chamados: ChamadoDoSintetico[];
  interacoes: InteracaoDoSintetico[];
}): LinhaDoSintetico[] {
  const matriz: Matriz = new Map();
  for (const chamado of params.chamados) addChamado(matriz, chamado, params.periodo);
  for (const interacao of params.interacoes)
    readCelula(matriz, interacao.usuarioId, interacao.projetoId).interacoes += interacao.total;
  return [...matriz.entries()].map(buildLinha);
}
