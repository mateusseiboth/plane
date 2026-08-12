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

/**
 * Um provedor de IA. Uma implementação por formato de protocolo; a fábrica em
 * `provedores/index.ts` resolve qual usar pelo nome vindo da configuração.
 *
 * `sugerir` **nunca lança**: serviço fora do ar, resposta estranha ou tempo
 * estourado viram sugestão vazia, porque escrever chamado não pode depender da
 * IA estar de pé.
 */
export interface ProvedorDeIa {
  readonly formato: string;
  sugerir(pedido: PedidoIa): Promise<RespostaIa>;
}

const CAMPOS_VALIDOS: CampoIa[] = ["titulo", "descricao", "comentario"];

export function normalizarCampo(valor: unknown): CampoIa | null {
  return CAMPOS_VALIDOS.find((c) => c === valor) ?? null;
}
