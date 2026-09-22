/**
 * Frases prontas do atendente: configuráveis por espaço e inseridas no
 * compositor. O SAC tinha dez frases fixas no `popChatAtendimento.php`; as sete
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

export function parseFrase(body: unknown): Resultado<DadosDaFrase> {
  const corpo = asCorpo(body);
  const texto = readText(corpo.texto, Number.MAX_SAFE_INTEGER);
  const errors: CampoComErro[] = [];
  if (!texto) errors.push(erro("texto", "Informe o texto da frase."));
  if (texto && texto.length > LIMITE_DO_TEXTO)
    errors.push(erro("texto", `A frase pode ter no máximo ${LIMITE_DO_TEXTO} caracteres.`));
  return finish(errors, () => ({ texto: texto!, ordem: readOrdem(corpo.ordem) }));
}
