/**
 * Tamanhos de um widget na grade da página inicial, em fração da largura. Fonte
 * única: vale para as preferências da pessoa e para o `defaultSize` que o
 * manifesto de um widget instalado declara.
 */
export const TAMANHOS_DE_WIDGET = ["1/3", "1/2", "2/3", "1/1"] as const;
export type TamanhoDeWidget = (typeof TAMANHOS_DE_WIDGET)[number];

export const isTamanhoDeWidget = (valor: unknown): valor is TamanhoDeWidget =>
  TAMANHOS_DE_WIDGET.includes(valor as TamanhoDeWidget);
