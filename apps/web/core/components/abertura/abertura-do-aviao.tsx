/**
 * Abertura do Avião: a tela que cobre tudo em todo carregamento completo.
 *
 * Fica no layout raiz, FORA do roteador, por dois motivos: aparece já no HTML
 * pré-renderizado (antes de o bundle chegar) e não é remontada por navegação
 * dentro da aplicação. Aparece a cada recarga, e só sai quando a aplicação
 * avisou que montou (`prontidaoDaApp`) E o avião completou o ciclo: quem
 * recarrega vê a cena inteira ao menos uma vez, e o avião sempre pousa antes
 * de a tela sumir. Se a aplicação demora, o ciclo repete.
 *
 * A primeira renderização no cliente precisa bater com o HTML pré-renderizado,
 * por isso o estado inicial é sempre "aberta": nada aqui depende de tema,
 * janela ou preferência antes de montar.
 */
import { useEffect, useRef, useState, type AnimationEvent } from "react";
import AviaoMark from "@/app/assets/logos/aviao-mark.svg?url";
import { Cena } from "./cena";
import { buildControleDaAbertura, type ControleDaAbertura } from "./controle-da-abertura";
import { prontidaoDaApp } from "./prontidao-da-app";

/** Mesmo valor de `--ab-ciclo` em `styles/abertura.css`. */
const CICLO_MS = 6500;
/** Rede de segurança: se os eventos de animação não vierem, sai depois de um ciclo e meio. */
const TEMPO_ESGOTADO_MS = CICLO_MS * 1.5;

const ANIMACAO_DO_VOO = "abertura-voo";
const ANIMACAO_DE_SAIDA = "abertura-sair";

type Fase = "aberta" | "saindo" | "encerrada";

const isMovimentoReduzido = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function AberturaDoAviao() {
  const [fase, setFase] = useState<Fase>("aberta");
  const controle = useRef<ControleDaAbertura | null>(null);

  useEffect(() => {
    const atual = buildControleDaAbertura({
      exigirCicloCompleto: !isMovimentoReduzido(),
      onEncerrar: () => setFase("saindo"),
    });
    controle.current = atual;

    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const cancelarAssinatura = prontidaoDaApp.onPronta(() => {
      atual.markPronta();
      temporizador = setTimeout(atual.onTempoEsgotado, TEMPO_ESGOTADO_MS);
    });

    return () => {
      cancelarAssinatura();
      if (temporizador) clearTimeout(temporizador);
    };
  }, []);

  if (fase === "encerrada") return null;

  const onIteracao = (evento: AnimationEvent<HTMLDivElement>) => {
    if (evento.animationName === ANIMACAO_DO_VOO) controle.current?.onFimDoCiclo();
  };

  const onFimDaSaida = (evento: AnimationEvent<HTMLDivElement>) => {
    if (evento.animationName === ANIMACAO_DE_SAIDA) setFase("encerrada");
  };

  return (
    <div
      className={fase === "saindo" ? "abertura abertura--saindo" : "abertura"}
      role="status"
      aria-label="Carregando o Avião"
      onAnimationEnd={onFimDaSaida}
    >
      <div onAnimationIteration={onIteracao}>
        <Cena />
      </div>
      <div className="abertura__marca">
        <img src={AviaoMark} alt="" />
        <div>
          <div className="abertura__nome">Avião</div>
          <div className="abertura__lema">Atendimento e chamados da Quality</div>
        </div>
      </div>
      <p className="abertura__legenda">Preparando a decolagem…</p>
    </div>
  );
}
