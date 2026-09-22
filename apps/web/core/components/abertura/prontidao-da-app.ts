/**
 * Sinal de "a aplicação carregou": quem monta a raiz avisa, a abertura escuta.
 *
 * É um sinal e não um estado do React porque a abertura vive FORA da árvore da
 * aplicação (está no layout, antes do roteador) e precisa saber quando a raiz
 * de verdade montou. Quem assina depois do aviso é avisado na hora.
 */

type Ouvinte = () => void;

export type ProntidaoDaApp = {
  isPronta: () => boolean;
  markPronta: () => void;
  /** Devolve a função que cancela a assinatura. */
  onPronta: (ouvinte: Ouvinte) => () => void;
};

export function buildProntidaoDaApp(): ProntidaoDaApp {
  let pronta = false;
  const ouvintes = new Set<Ouvinte>();

  return {
    isPronta: () => pronta,
    markPronta: () => {
      if (pronta) return;
      pronta = true;
      ouvintes.forEach((ouvinte) => ouvinte());
      ouvintes.clear();
    },
    onPronta: (ouvinte) => {
      if (pronta) {
        ouvinte();
        return () => {};
      }
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

/** A instância única da aplicação. */
export const prontidaoDaApp = buildProntidaoDaApp();
