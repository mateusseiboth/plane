/**
 * Frases prontas do atendente, inseridas no compositor: as do espaço
 * (compartilhadas, configuradas por quem administra) e as pessoais de cada
 * atendente. O SAC tinha dez frases fixas no `popChatAtendimento.php`; as sete
 * primeiras viram o padrão oferecido na configuração. As três últimas eram a
 * pesquisa de satisfação digitada à mão, que o chat já faz sozinho
 * (`src/rating.ts`), e ficaram de fora.
 *
 * Puro: só valida o que chega.
 */

import { asCorpo, erro, finish, readText, type CampoComErro, type Resultado } from "@/ligacoes/payload";

export const FRASES_PADRAO: readonly string[] = [
  "Agradecemos sua visita e estamos à disposição para lhe atender. Por favor, não hesite em nos chamar e volte sempre.",
  "Farei uma solicitação de correção e entrarei em contato novamente quando estiver pronta.",
  "Aguarde um momento, por favor.",
  "Há algo em que eu possa ajudar?",
  "Algo mais em que eu possa ajudar?",
  "Um momento por favor, irei verificar sua solicitação.",
  "Irei pegar o seu banco de dados para verificar o erro.",
];

const LIMITE_DO_TEXTO = 1000;

export type DadosDaFrase = { texto: string; ordem: number };

const readOrdem = (valor: unknown): number => {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0 ? numero : 0;
};

/**
 * Frase do espaço: compartilhada, cadastrada por quem administra o chat.
 * Frase pessoal: só quem a cadastrou vê, edita e apaga.
 */
export const ESCOPO_DA_FRASE = { ESPACO: "espaco", PESSOAL: "pessoal" } as const;
export type EscopoDaFrase = (typeof ESCOPO_DA_FRASE)[keyof typeof ESCOPO_DA_FRASE];

const DONO_POR_ESCOPO: Record<EscopoDaFrase, (userId: string) => string | null> = {
  [ESCOPO_DA_FRASE.ESPACO]: () => null,
  [ESCOPO_DA_FRASE.PESSOAL]: (userId) => userId,
};

/** O `owner_user_id` gravado: nulo é do espaço. */
export const buildDonoDaFrase = (escopo: EscopoDaFrase, userId: string): string | null =>
  DONO_POR_ESCOPO[escopo](userId);

export const readEscopoDaFrase = (frase: { ownerUserId: string | null }): EscopoDaFrase =>
  frase.ownerUserId ? ESCOPO_DA_FRASE.PESSOAL : ESCOPO_DA_FRASE.ESPACO;

/** O que aparece no compositor de quem atende: as do espaço e as próprias. */
export const buildFiltroDasFrasesVisiveis = (slug: string, userId: string) => ({
  workspaceId: slug,
  OR: [{ ownerUserId: null }, { ownerUserId: userId }],
});

export function parseFrase(body: unknown): Resultado<DadosDaFrase> {
  const corpo = asCorpo(body);
  const texto = readText(corpo.texto, Number.MAX_SAFE_INTEGER);
  const errors: CampoComErro[] = [];
  if (!texto) errors.push(erro("texto", "Informe o texto da frase."));
  if (texto && texto.length > LIMITE_DO_TEXTO)
    errors.push(erro("texto", `A frase pode ter no máximo ${LIMITE_DO_TEXTO} caracteres.`));
  return finish(errors, () => ({ texto: texto!, ordem: readOrdem(corpo.ordem) }));
}
