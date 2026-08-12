/**
 * Análise do chamado no momento de salvar — Parte 2 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * O texto fantasma ajuda enquanto se escreve; esta rota fecha o ciclo ao
 * salvar: roda o checklist de aceitação inteiro, aplica as regras da aula e os
 * cinco porquês, e devolve nota, o que falta e o que dá para melhorar.
 *
 * Vale aqui a mesma regra de ouro do irmão `sugestao-de-requisito.service`:
 * **falhou, calou**. Rota fora do ar, 404, tempo esgotado ou resposta estranha
 * devolvem `SEM_ANALISE` — nota `null`, listas vazias — e quem chamou segue com
 * o salvamento. A IA nunca impede de trabalhar, nem no modo `exigir`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";
import type { TContextoDeRequisito, TItemFaltante } from "@/services/sugestao-de-requisito.service";

/** O chamado inteiro (título + descrição) ou um comentário isolado. */
export type TCampoDeAnalise = "chamado" | "comentario";

/** Um bloco do checklist de aceitação da Aula 18-3, com o que ainda falta nele. */
export type TBlocoDeAceitacao = {
  bloco: string;
  percentual: number;
  faltando: string[];
};

export type TAnaliseDeChamado = {
  /**
   * 0–100, calculada pelo checklist determinístico do lado do modelo.
   * `null` quando a IA não deu nota — e **sem nota não se bloqueia ninguém**.
   */
  aceitacao: number | null;
  blocos: TBlocoDeAceitacao[];
  /** Cinco porquês; só vem preenchido quando a causa raiz não está clara. */
  porques: string[];
  feedback: string;
  /** Trechos prontos para colar no chamado. */
  sugestoes: string[];
};

export type TPedidoDeAnalise = {
  campo: TCampoDeAnalise;
  /**
   * Um dos dois é obrigatório — é contra o projeto que a rota confere
   * permissão. Na abertura de chamado temos o `project_id`; no comentário, o
   * `issue_id` (o backend deduz o projeto).
   */
  project_id?: string;
  issue_id?: string;
  titulo?: string;
  descricao?: string;
  comentario?: string;
  tipo?: string | null;
  entity_id?: string | null;
  /** O que a tela já sabe; o servidor usa como reserva. */
  contexto: TContextoDeRequisito;
};

/** Resposta neutra: sem nota, sem blocos, sem nada a dizer. */
export const SEM_ANALISE: TAnaliseDeChamado = {
  aceitacao: null,
  blocos: [],
  porques: [],
  feedback: "",
  sugestoes: [],
};

/**
 * Teto de espera. Quem espera é o botão de salvar, então o número não pode ser
 * generoso: a análise roda o checklist inteiro (mais lenta que a sugestão de
 * 2,2 s do fantasma), mas passar disso é melhor desistir e salvar.
 */
const TEMPO_LIMITE_MS = 10000;

const lerTexto = (valor: unknown): string => (typeof valor === "string" ? valor : "");

const lerListaDeTextos = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.map(lerTexto).filter((linha) => linha.trim().length > 0) : [];

/** Fora de 0–100 (ou ausente) é o mesmo que "a IA não deu nota". */
const lerNota = (dados: any): number | null => {
  const bruto = Number(dados?.aceitacao ?? dados?.acceptance);
  if (!Number.isFinite(bruto)) return null;
  return Math.min(Math.max(Math.round(bruto), 0), 100);
};

const lerBlocos = (dados: any): TBlocoDeAceitacao[] => {
  const bruto = dados?.blocos ?? dados?.blocks;
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((linha: any) => ({
      bloco: lerTexto(linha?.bloco ?? linha?.block),
      percentual: Math.min(Math.max(Math.round(Number(linha?.percentual ?? linha?.percentage) || 0), 0), 100),
      faltando: lerListaDeTextos(linha?.faltando ?? linha?.missing),
    }))
    .filter((linha: TBlocoDeAceitacao) => linha.bloco.length > 0);
};

const normalizar = (dados: any): TAnaliseDeChamado => ({
  aceitacao: lerNota(dados),
  blocos: lerBlocos(dados),
  porques: lerListaDeTextos(dados?.porques ?? dados?.whys),
  feedback: lerTexto(dados?.feedback),
  sugestoes: lerListaDeTextos(dados?.sugestoes ?? dados?.suggestions),
});

/**
 * Achata os blocos reprovados na mesma forma que o checklist do texto fantasma
 * já usa, para o componente `ItensFaltantes` servir aos dois.
 */
export const itensFaltantesDosBlocos = (blocos: TBlocoDeAceitacao[]): TItemFaltante[] =>
  blocos.flatMap((bloco) => bloco.faltando.map((item) => ({ bloco: bloco.bloco, item })));

/**
 * Análise sem nota, sem pendência e sem palavra é análise que não vale
 * interromper ninguém: nesses casos o salvamento segue direto.
 */
export const temAlgoADizer = (analise: TAnaliseDeChamado): boolean =>
  itensFaltantesDosBlocos(analise.blocos).length > 0 ||
  analise.porques.length > 0 ||
  analise.sugestoes.length > 0 ||
  analise.feedback.trim().length > 0 ||
  (analise.aceitacao !== null && analise.aceitacao < 100);

export class AnaliseDeChamadoService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async analisar(workspaceSlug: string, pedido: TPedidoDeAnalise): Promise<TAnaliseDeChamado> {
    return this.post(`/api/workspaces/${workspaceSlug}/ia/analise-de-chamado/`, pedido, {
      timeout: TEMPO_LIMITE_MS,
    })
      .then((res) => normalizar(res?.data))
      .catch(() => SEM_ANALISE);
  }
}

const analiseDeChamadoService = new AnaliseDeChamadoService();
export default analiseDeChamadoService;
