/**
 * Alerta sonoro do painel de TV. No SAC era o `cliparado.mp3`, que tocava quando
 * um chamado de cliente parado chegava ao setor; aqui "cliente parado" é a
 * prioridade urgente. O som é gerado pelo navegador (Web Audio), sem arquivo.
 *
 * O navegador só libera áudio depois de um clique na página, por isso a tela
 * pede para ativar o som uma vez.
 */

/** Urgentes que ainda não tocaram: toca quando aparece um novo, não a cada atualização. */
export const readAlertasNovos = (jaAvisados: ReadonlySet<string>, atuais: string[]) =>
  atuais.filter((id) => !jaAvisados.has(id));

type TAudioContextCtor = typeof AudioContext;

const readAudioContext = (): TAudioContextCtor | undefined =>
  typeof window === "undefined"
    ? undefined
    : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: TAudioContextCtor }).webkitAudioContext);

/** Três bipes curtos. */
export function playAlertaUrgente(contexto: AudioContext) {
  const agora = contexto.currentTime;
  [0, 0.35, 0.7].forEach((atraso) => {
    const oscilador = contexto.createOscillator();
    const volume = contexto.createGain();
    oscilador.type = "square";
    oscilador.frequency.value = 880;
    volume.gain.setValueAtTime(0.15, agora + atraso);
    volume.gain.exponentialRampToValueAtTime(0.001, agora + atraso + 0.25);
    oscilador.connect(volume).connect(contexto.destination);
    oscilador.start(agora + atraso);
    oscilador.stop(agora + atraso + 0.25);
  });
}

export function createAudioContext(): AudioContext | null {
  const Contexto = readAudioContext();
  return Contexto ? new Contexto() : null;
}
