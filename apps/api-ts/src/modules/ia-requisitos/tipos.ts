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

// ── Melhorar o texto (o botão "Melhorar com IA") ─────────────────────────────

/** O que está sendo melhorado: a descrição do chamado ou um comentário. */
export type CampoMelhoria = "descricao" | "comentario";

/**
 * O texto vai e volta em HTML porque é o que o editor produz e consome. Quem
 * sabe melhorar como requisito é o serviço: daqui saem o texto e o contexto,
 * nada de metodologia — no formato nativo ela mora no modelo.
 */
export type PedidoMelhoria = {
  texto: string;
  campo: CampoMelhoria;
  contexto: ContextoIa;
};

/**
 * Suspeitas da guarda do serviço: trechos do original que podem ter sumido da
 * proposta (`perdidos`) e trechos da proposta que podem não vir do original
 * (`inventados`).
 *
 * Elas **informam, não vetam** (Parte 3 do contrato). Vetar era o defeito que
 * se está corrigindo: a guarda lia os números `1.`, `2.`, `3.` das listas do
 * próprio template como dado fabricado e devolvia o texto intacto com um aviso
 * de sucesso. Quem decide o que fazer com a suspeita é quem escreveu o texto.
 */
export type AvisosDaMelhoria = {perdidos: string[]; inventados: string[]};

/**
 * A nota do checklist antes e depois da proposta — **referência, não veredito**.
 * Nenhum dos dois números decide se a proposta vale: ela é sempre entregue.
 *
 * Cada lado é `null` quando o serviço não mandou aquele número, e o objeto
 * inteiro é `null` quando não mandou nenhum. Ausência é ausência: a tela sabe
 * não desenhar o medidor, e ninguém precisa distinguir isso de um zero.
 */
export type AceitacaoDaMelhoria = {antes: number | null; depois: number | null};

/**
 * A proposta da IA, como a tela do diff a consome.
 *
 * `mudou` distingue "aqui está a proposta" de "não produzi nada" — e é só isso
 * que ele significa. Não é julgamento de qualidade nem permissão para aplicar:
 * quem decide é o autor, vendo o texto dele e o da IA lado a lado.
 */
export type RespostaMelhoria = {
  texto: string;
  mudou: boolean;
  avisos: AvisosDaMelhoria;
  aceitacao: AceitacaoDaMelhoria | null;
};

/** Sem suspeita nenhuma — e sempre um objeto novo, para ninguém mutar o vizinho. */
export function semAvisos(): AvisosDaMelhoria {
  return {perdidos: [], inventados: []};
}

/** Melhoria que não aconteceu: quem chamou decide o que dizer a quem clicou. */
export const MELHORIA_VAZIA: RespostaMelhoria = {
  texto: "",
  mudou: false,
  avisos: semAvisos(),
  aceitacao: null,
};

/**
 * Um provedor de IA. Uma implementação por formato de protocolo; a fábrica em
 * `provedores/index.ts` resolve qual usar pelo nome vindo da configuração.
 *
 * Nenhum dos três métodos **lança**: serviço fora do ar, resposta estranha ou
 * tempo estourado viram resposta vazia, porque escrever chamado não pode
 * depender da IA estar de pé.
 */
export interface ProvedorDeIa {
  readonly formato: string;
  sugerir(pedido: PedidoIa): Promise<RespostaIa>;
  analisar(pedido: PedidoAnalise): Promise<RespostaAnalise>;
  melhorar(pedido: PedidoMelhoria): Promise<RespostaMelhoria>;
}

const CAMPOS_VALIDOS: CampoIa[] = ["titulo", "descricao", "comentario"];

export function normalizarCampo(valor: unknown): CampoIa | null {
  return CAMPOS_VALIDOS.find((c) => c === valor) ?? null;
}

const CAMPOS_DE_ANALISE: CampoAnalise[] = ["chamado", "comentario"];

export function normalizarCampoDeAnalise(valor: unknown): CampoAnalise | null {
  return CAMPOS_DE_ANALISE.find((c) => c === valor) ?? null;
}

const CAMPOS_DE_MELHORIA: CampoMelhoria[] = ["descricao", "comentario"];

/**
 * O botão "Melhorar com IA" existe nos dois lugares e a tela ainda não diz de
 * qual deles veio o clique. Sem essa informação vale o caso mais comum e o mais
 * seguro — a caixa de comentário —, que só acrescenta contexto ao pedido.
 */
export function normalizarCampoDeMelhoria(valor: unknown): CampoMelhoria {
  return CAMPOS_DE_MELHORIA.find((c) => c === valor) ?? "comentario";
}
