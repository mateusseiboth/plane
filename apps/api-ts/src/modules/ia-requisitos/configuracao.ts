/**
 * Configuração da IA de requisitos **por espaço de trabalho**.
 *
 * Não confundir com `config.ts`: lá ficam o endereço, o formato e a credencial
 * do provedor — coisas do processo, que o navegador nunca vê. Aqui fica o que
 * cada espaço de trabalho decide sobre o recurso: se o texto fantasma aparece,
 * se a análise roda ao salvar, se ela roda também nos comentários, e o que a
 * tela faz com a nota.
 *
 * Mora em `WorkspaceSetting` (tabela chave/valor que já existe), chave
 * `ia_requisitos`. **Sem migração** — o modelo já serve.
 *
 * Este arquivo é PURO de propósito: nada de Prisma. Quem lê e grava é a rota
 * (`index.ts`), e o seeder importa os padrões daqui sem abrir uma segunda
 * conexão com o banco — o mesmo arranjo de `utils/permissions.ts`.
 */

export const CHAVE_CONFIG_IA = "ia_requisitos";

/**
 * O que a tela faz com a nota:
 *  - `avisar` — mostra a análise e deixa salvar assim mesmo. É o padrão.
 *  - `exigir` — abaixo de `minimo_aceitacao` o salvar fica bloqueado, com o que
 *    falta na tela. Existe porque o dono pediu; nunca deve ser o padrão de quem
 *    instala o Avião. Mesmo aqui, **sem nota não bloqueia**: a IA fora do ar não
 *    pode impedir ninguém de trabalhar.
 *  - `silencioso` — analisa e guarda, sem interromper.
 */
export type ModoDeAnalise = "avisar" | "exigir" | "silencioso";

export type ConfigIaDoEspaco = {
  fantasma_ativo: boolean;
  analise_ativa: boolean;
  analise_em_comentarios: boolean;
  modo: ModoDeAnalise;
  minimo_aceitacao: number;
  mostrar_indicador: boolean;
  /**
   * O botão "Melhorar com IA" pode cair na IA de requisitos quando o espaço não
   * tem provedor próprio configurado (`AiProvider`). Desligar aqui devolve o
   * botão ao comportamento antigo: sem provedor próprio, ele avisa que não há
   * provedor. A tela de configuração ainda não tem esse interruptor — ele existe
   * para quem precisar desligar a saída de texto pela API.
   */
  melhoria_ativa: boolean;
};

/** Os padrões do contrato, valendo para todo espaço que nunca ajustou nada. */
export const CONFIG_IA_PADRAO: ConfigIaDoEspaco = {
  fantasma_ativo: true,
  analise_ativa: true,
  analise_em_comentarios: true,
  modo: "avisar",
  minimo_aceitacao: 70,
  mostrar_indicador: true,
  melhoria_ativa: true,
};

const MODOS: ModoDeAnalise[] = ["avisar", "exigir", "silencioso"];

function booleano(valor: unknown, padrao: boolean): boolean {
  return typeof valor === "boolean" ? valor : padrao;
}

function modo(valor: unknown, padrao: ModoDeAnalise): ModoDeAnalise {
  return MODOS.find((m) => m === valor) ?? padrao;
}

/**
 * O tipo é conferido antes da conversão: `Number(null)`, `Number("")` e
 * `Number([])` valem 0, e mandar `null` no PATCH viraria "mínimo zero" em vez de
 * "não mexi nisso".
 */
function percentual(valor: unknown, padrao: number): number {
  if (typeof valor !== "number" && typeof valor !== "string") return padrao;
  if (valor === "") return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(Math.round(n), 0), 100);
}

/**
 * O que está gravado, lido como objeto.
 *
 * A coluna é `Json`, mas nada garante que o conteúdo seja o nosso objeto: pode
 * ter sido gravado como texto, como lista, como `null`, ou por uma versão
 * anterior com outra forma. **Nada disso pode derrubar a rota** — o que não der
 * para aproveitar vira `{}` e cai nos padrões.
 */
function comoObjeto(valor: unknown): Record<string, unknown> {
  const bruto = typeof valor === "string" ? tentarLerJson(valor) : valor;
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  return bruto as Record<string, unknown>;
}

function tentarLerJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    console.warn("[ia-requisitos] configuração do espaço de trabalho ilegível; usando os padrões.");
    return null;
  }
}

/** Aplica os padrões campo a campo: chave ausente ou de tipo errado não contamina o resto. */
export function sanitizarConfigIa(valor: unknown): ConfigIaDoEspaco {
  const g = comoObjeto(valor);
  return {
    fantasma_ativo: booleano(g.fantasma_ativo, CONFIG_IA_PADRAO.fantasma_ativo),
    analise_ativa: booleano(g.analise_ativa, CONFIG_IA_PADRAO.analise_ativa),
    analise_em_comentarios: booleano(g.analise_em_comentarios, CONFIG_IA_PADRAO.analise_em_comentarios),
    modo: modo(g.modo, CONFIG_IA_PADRAO.modo),
    minimo_aceitacao: percentual(g.minimo_aceitacao, CONFIG_IA_PADRAO.minimo_aceitacao),
    mostrar_indicador: booleano(g.mostrar_indicador, CONFIG_IA_PADRAO.mostrar_indicador),
    melhoria_ativa: booleano(g.melhoria_ativa, CONFIG_IA_PADRAO.melhoria_ativa),
  };
}

/**
 * Escrita parcial: o que o corpo não trouxer continua como está. Assim a tela
 * pode mandar só o interruptor que a pessoa mexeu, sem reenviar o resto.
 */
export function mesclarConfigIa(gravado: unknown, corpo: unknown): ConfigIaDoEspaco {
  const atual = sanitizarConfigIa(gravado);
  const b = comoObjeto(corpo);
  return {
    fantasma_ativo: booleano(b.fantasma_ativo, atual.fantasma_ativo),
    analise_ativa: booleano(b.analise_ativa, atual.analise_ativa),
    analise_em_comentarios: booleano(b.analise_em_comentarios, atual.analise_em_comentarios),
    modo: modo(b.modo, atual.modo),
    minimo_aceitacao: percentual(b.minimo_aceitacao, atual.minimo_aceitacao),
    mostrar_indicador: booleano(b.mostrar_indicador, atual.mostrar_indicador),
    melhoria_ativa: booleano(b.melhoria_ativa, atual.melhoria_ativa),
  };
}
