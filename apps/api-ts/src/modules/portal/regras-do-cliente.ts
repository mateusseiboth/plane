/**
 * O que o cliente pode fazer com a solicitação dele, sem banco.
 *
 * Paridade com o Service Desk do `suporte/` antigo: responder enquanto o
 * chamado anda, encerrar quando já resolveu, avaliar ao concluir e reabrir com
 * motivo. A decisão mora aqui, uma vez só: a rota confere com ela antes de
 * gravar e a página desenha os botões a partir do mesmo resultado (`acoes`).
 */

import type { FieldErrorItem, HttpError } from "@utils/field-error";
import { STATE } from "@utils/permissions";
import { limparTextoDoCliente, textoSemMarcacao } from "@modules/portal/texto-rico";

/** `intake_issues.status` que encerram a conversa: a triagem recusou ou achou duplicada. */
const DECIDIDA_NA_TRIAGEM: ReadonlySet<number> = new Set([-1, 2]);

export type AcoesDoCliente = { responder: boolean; reabrir: boolean; encerrar: boolean; avaliar: boolean };

const NENHUMA: AcoesDoCliente = { responder: false, reabrir: false, encerrar: false, avaliar: false };

/** Por grupo de estado do chamado. Grupo que não está aqui é trabalho em curso. */
const ACOES_POR_GRUPO: Record<string, (avaliada: boolean) => AcoesDoCliente> = {
  completed: (avaliada) => ({ ...NENHUMA, reabrir: true, avaliar: !avaliada }),
  cancelled: () => NENHUMA,
};

const EM_ANDAMENTO = (): AcoesDoCliente => ({ ...NENHUMA, responder: true, encerrar: true });

export function readAcoesDoCliente(entrada: {
  intakeStatus: number;
  grupo: string;
  avaliada: boolean;
}): AcoesDoCliente {
  if (DECIDIDA_NA_TRIAGEM.has(entrada.intakeStatus)) return NENHUMA;
  return (ACOES_POR_GRUPO[entrada.grupo] ?? EM_ANDAMENTO)(entrada.avaliada);
}

export type EstadoDoProjeto = { id: string; name: string; group: string; sequence: number; default: boolean };

const porSequencia = (a: EstadoDoProjeto, b: EstadoDoProjeto) => a.sequence - b.sequence;

const primeiroDoGrupo = (estados: EstadoDoProjeto[], grupo: string) =>
  estados.filter((e) => e.group === grupo).toSorted(porSequencia)[0] ?? null;

/**
 * Para onde o chamado volta quando o cliente reabre.
 *
 * "Em Análise" é a etapa em que a triagem põe o que aceitou: reabrir é pedir à
 * equipe que olhe de novo, não recomeçar a triagem. Sem ela, o primeiro estado
 * em andamento; sem nenhum, o padrão do projeto.
 */
export function pickEstadoDeReabertura(estados: EstadoDoProjeto[]): EstadoDoProjeto | null {
  return (
    estados.find((e) => e.name === STATE.EM_ANALISE) ??
    primeiroDoGrupo(estados, "started") ??
    estados.find((e) => e.default && e.group !== "completed" && e.group !== "cancelled") ??
    null
  );
}

/** Para onde o chamado vai quando o cliente diz que já resolveu. */
export function pickEstadoDeEncerramento(estados: EstadoDoProjeto[]): EstadoDoProjeto | null {
  return estados.find((e) => e.name === STATE.CONCLUIDO) ?? primeiroDoGrupo(estados, "completed");
}

// ── Avaliação ────────────────────────────────────────────────────────────────

/** As duas perguntas do suporte antigo, com os mesmos valores gravados lá. */
export const NOTAS_DE_ATENDIMENTO: Record<number, string> = { 1: "Ruim", 2: "Bom", 3: "Ótimo" };
export const EXPECTATIVAS: Record<number, string> = {
  1: "Não era o que eu precisava",
  2: "Não",
  3: "Parcialmente",
  4: "Sim",
};

const LIMITE_DO_COMENTARIO = 2000;

export type Avaliacao = { notaAtendimento: number; expectativa: number; comentario: string | null };

function readOpcao(valor: unknown, escala: Record<number, string>): number | null {
  const numero = Number(valor);
  return escala[numero] ? numero : null;
}

/** Erro de validação com um item por campo, no formato que o tratador global devolve. */
export function buildErrosDeCampo(errors: FieldErrorItem[]): HttpError {
  return { status: 400, message: errors[0]?.message ?? "Confira os campos.", errors };
}

export function readAvaliacao(corpo: Record<string, unknown>): Avaliacao {
  const notaAtendimento = readOpcao(corpo.nota_atendimento, NOTAS_DE_ATENDIMENTO);
  const expectativa = readOpcao(corpo.expectativa, EXPECTATIVAS);
  const errors: FieldErrorItem[] = [
    ...(notaAtendimento ? [] : [{ path: "nota_atendimento", message: "Escolha como foi o atendimento." }]),
    ...(expectativa ? [] : [{ path: "expectativa", message: "Diga se o atendimento resolveu o que você precisava." }]),
  ];
  if (errors.length) throw buildErrosDeCampo(errors);
  const comentario = String(corpo.comentario ?? "")
    .trim()
    .slice(0, LIMITE_DO_COMENTARIO);
  return {
    notaAtendimento: notaAtendimento as number,
    expectativa: expectativa as number,
    comentario: comentario || null,
  };
}

// ── Texto da interação ───────────────────────────────────────────────────────

/**
 * O HTML que o cliente escreveu, limpo, e o texto puro dele.
 * `null` quando não sobra texto: parágrafo vazio não é resposta.
 */
export function readTextoDaInteracao(bruto: unknown): { html: string; texto: string } | null {
  const html = limparTextoDoCliente(bruto);
  const texto = textoSemMarcacao(html);
  if (!texto) return null;
  return { html, texto };
}
