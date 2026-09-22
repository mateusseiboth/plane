/**
 * Número da visita no formato do SAC: `N-AAAA`, com N reiniciando a cada ano.
 *
 * Gerador PRÓPRIO da visita. A numeração dos chamados é outra regra e mora em
 * outro lugar; não misture as duas.
 */
import { dataLocal } from "@utils/prazo";

const NUMERO_DA_VISITA = /^(\d+)-(\d{4})$/;

export const formatVisitNumber = (sequencial: number, ano: number): string => `${sequencial}-${ano}`;

/** Ano do número, contado no fuso do escritório: 31/12 às 22h ainda é o ano velho. */
export const getAnoDaVisita = (agora: Date): number => Number(dataLocal(agora).slice(0, 4));

const readSequencial = (numero: string | null, ano: number): number => {
  const partes = NUMERO_DA_VISITA.exec((numero ?? "").trim());
  if (!partes || Number(partes[2]) !== ano) return 0;
  return Number(partes[1]);
};

/**
 * Maior N já usado no ano. As visitas importadas do SAC trazem o número pronto;
 * a primeira visita nova do ano continua depois delas em vez de repetir "1-AAAA".
 */
export const findMaiorSequencial = (numeros: readonly (string | null)[], ano: number): number =>
  numeros.reduce((maior, numero) => Math.max(maior, readSequencial(numero, ano)), 0);
