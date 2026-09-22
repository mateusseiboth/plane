/**
 * Quando a abertura pode sair da tela.
 *
 * Duas condições, nesta ordem: a aplicação avisou que está pronta E o avião
 * terminou um ciclo (pousou). Se a aplicação demora, o ciclo repete até ela
 * chegar; se ela chega no meio do voo, espera o pouso. Assim ninguém vê o
 * avião sumir no ar, e todo carregamento mostra a cena inteira ao menos uma vez.
 *
 * `exigirCicloCompleto: false` é para quem pediu movimento reduzido: sem
 * animação não há ciclo, então a tela sai assim que a aplicação está pronta.
 * `onTempoEsgotado` é a rede de segurança para navegador que não dispara os
 * eventos de animação; nunca encerra antes de a aplicação estar pronta.
 */

export type OpcoesDoControle = {
  exigirCicloCompleto: boolean;
  onEncerrar: () => void;
};

export type ControleDaAbertura = {
  markPronta: () => void;
  onFimDoCiclo: () => void;
  onTempoEsgotado: () => void;
  isEncerrada: () => boolean;
};

export function buildControleDaAbertura({ exigirCicloCompleto, onEncerrar }: OpcoesDoControle): ControleDaAbertura {
  let pronta = false;
  let encerrada = false;

  const encerrar = () => {
    if (encerrada || !pronta) return;
    encerrada = true;
    onEncerrar();
  };

  return {
    markPronta: () => {
      pronta = true;
      if (!exigirCicloCompleto) encerrar();
    },
    onFimDoCiclo: encerrar,
    onTempoEsgotado: encerrar,
    isEncerrada: () => encerrada,
  };
}
