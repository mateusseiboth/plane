/**
 * Vocabulário da IA de levantamento de requisitos.
 *
 * O formato do pedido e da resposta é o do contrato
 * (`.claude/CONTRATO_IA_REQUISITOS.md`) — o mesmo que a rota expõe ao frontend
 * e o mesmo que o provedor nativo (`aviao`) fala. Os demais provedores
 * traduzem de/para esta forma; nada fora de `provedores/` conhece o protocolo
 * de nenhum deles.
 */

export type CampoIa = "titulo" | "descricao" | "comentario";

export type AnexoIa = {nome: string; texto_extraido: string};

export type ContextoIa = {
  tipo: string | null;
  projeto: string | null;
  entidade: string | null;
  titulo?: string;
  descricao?: string;
  comentarios: string[];
  anexos: AnexoIa[];
};

export type PedidoIa = {
  campo: CampoIa;
  texto_atual: string;
  cursor: number;
  contexto: ContextoIa;
};

/** Item do checklist de 8 blocos da Aula 18-3 que o chamado ainda não atende. */
export type ItemFaltando = {bloco: string; item: string};

export type RespostaIa = {
  sugestao: string;
  faltando: ItemFaltando[];
  confianca: number;
};

/** O que a rota devolve quando não há nada útil a dizer — sempre com 200. */
export const RESPOSTA_VAZIA: RespostaIa = {sugestao: "", faltando: [], confianca: 0};

// ── Análise no salvar (Parte 2 do contrato) ──────────────────────────────────

/** O que está sendo salvo: o chamado inteiro ou só um comentário. */
export type CampoAnalise = "chamado" | "comentario";

export type PedidoAnalise = {
  campo: CampoAnalise;
  titulo: string;
  descricao: string;
  comentario: string;
  contexto: ContextoIa;
};

/** Um dos 8 blocos do checklist de aceitação (Parte 9 da Aula 18-3). */
export type BlocoDaAnalise = {bloco: string; percentual: number; faltando: string[]};

/**
 * O resultado da análise, como o frontend o consome.
 *
 * `aceitacao` é `null` — e não `0` — quando **não houve nota**: IA desligada,
 * fora do ar, com erro, lenta demais ou resposta que não deu para aproveitar.
 * A diferença é a regra mais importante do contrato: quem decide bloquear é a
 * tela, com base na nota que CHEGOU. Sem nota, não bloqueia, nem no modo
 * `exigir` — barrar o salvamento porque um serviço está fora seria pior que não
 * ter o recurso. `analisado` diz a mesma coisa por extenso, para a tela não
 * precisar distinguir `null` de `0` num `if`.
 */
export type RespostaAnalise = {
  aceitacao: number | null;
  blocos: BlocoDaAnalise[];
  porques: string[];
  feedback: string;
  sugestoes: string[];
};

/** Análise que não aconteceu. Sempre com 200 — a IA nunca impede de trabalhar. */
export const ANALISE_VAZIA: RespostaAnalise = {
  aceitacao: null,
  blocos: [],
  porques: [],
  feedback: "",
  sugestoes: [],
};

/**
 * Um provedor de IA. Uma implementação por formato de protocolo; a fábrica em
 * `provedores/index.ts` resolve qual usar pelo nome vindo da configuração.
 *
 * Nenhum dos dois métodos **lança**: serviço fora do ar, resposta estranha ou
 * tempo estourado viram resposta vazia, porque escrever chamado não pode
 * depender da IA estar de pé.
 */
export interface ProvedorDeIa {
  readonly formato: string;
  sugerir(pedido: PedidoIa): Promise<RespostaIa>;
  analisar(pedido: PedidoAnalise): Promise<RespostaAnalise>;
}

const CAMPOS_VALIDOS: CampoIa[] = ["titulo", "descricao", "comentario"];

export function normalizarCampo(valor: unknown): CampoIa | null {
  return CAMPOS_VALIDOS.find((c) => c === valor) ?? null;
}

const CAMPOS_DE_ANALISE: CampoAnalise[] = ["chamado", "comentario"];

export function normalizarCampoDeAnalise(valor: unknown): CampoAnalise | null {
  return CAMPOS_DE_ANALISE.find((c) => c === valor) ?? null;
}
