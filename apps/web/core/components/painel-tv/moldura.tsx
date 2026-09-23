/**
 * A moldura de todo painel de TV: fundo escuro, o conteúdo ocupando a tela
 * inteira e UM rodapé com a legenda à esquerda e, no canto inferior direito,
 * os totais do painel, o selo "ao vivo", a idade dos dados, os dois botões e
 * o relógio. Não há barra no topo: numa TV cada pixel de altura conta.
 *
 * É uma tela de PAREDE: tipografia grande, nada de menu, nada clicável que o
 * operador precise acertar. Os dois botões (tela cheia e som) existem porque o
 * navegador exige um clique para cada um e ficam discretos.
 */
import type { ReactNode } from "react";
import { Bell, BellOff, Maximize, RefreshCw, TriangleAlert } from "lucide-react";
import { FUNDO_DO_PAINEL } from "./cores";
import { formatDuracao, formatHora } from "./painel-helpers";

type Props = {
  titulo: string;
  espaco: string | null;
  agora: Date;
  idadeDosDados: number | null;
  aoVivo: boolean;
  som?: { ativo: boolean; querSom: boolean; ativar: () => void; desativar: () => void };
  acoes?: ReactNode;
  legenda?: ReactNode;
  children: ReactNode;
};

const telaCheia = () => void document.documentElement.requestFullscreen?.();

export function MolduraDoPainel({ titulo, agora, idadeDosDados, aoVivo, som, acoes, legenda, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden text-white"
      style={{ backgroundColor: FUNDO_DO_PAINEL }}
    >
      <main className="min-h-0 flex-1 overflow-hidden p-4" aria-label={titulo}>
        {children}
      </main>

      <footer className="text-base flex shrink-0 items-center gap-6 border-t border-white/10 px-6 py-2 text-white/60">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-6">{legenda}</div>

        <div className="flex shrink-0 items-center gap-5">
          {acoes}
          <span className="flex items-center gap-2">
            <span
              className={`inline-block size-2.5 rounded-full ${aoVivo ? "animate-pulse bg-[#0ca30c]" : "bg-[#d03b3b]"}`}
              aria-hidden
            />
            <span>{aoVivo ? "Ao vivo" : "Sem conexão"}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <RefreshCw className="size-4" aria-hidden />
            <span>há {formatDuracao(idadeDosDados)}</span>
          </span>
          {som && (
            <button
              type="button"
              onClick={som.ativo ? som.desativar : som.ativar}
              className={`rounded-lg border px-2 py-1 transition ${
                som.querSom ? "animate-pulse border-[#fab219] text-[#fab219]" : "border-white/20 text-white/70"
              }`}
              title={som.ativo ? "Desativar o som do alerta" : "Ativar o som do alerta"}
            >
              {som.ativo ? <Bell className="size-5" /> : <BellOff className="size-5" />}
            </button>
          )}
          <button
            type="button"
            onClick={telaCheia}
            className="rounded-lg border border-white/20 px-2 py-1 text-white/70 transition hover:text-white"
            title="Tela cheia"
          >
            <Maximize className="size-5" />
          </button>
          <time className="font-mono text-4xl font-semibold text-white tabular-nums">{formatHora(agora)}</time>
        </div>
      </footer>
    </div>
  );
}

/** Item da legenda: cor + texto, porque cor sozinha não diz nada. */
export function ItemDaLegenda({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="inline-block size-4 rounded" style={{ backgroundColor: cor }} aria-hidden />
      {children}
    </span>
  );
}

/** Tela de erro do painel, grande o bastante para ser lida de longe. */
export function ErroDoPainel({ mensagem, detalhe }: { mensagem: string; detalhe?: string }) {
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 px-10 text-center text-white"
      style={{ backgroundColor: FUNDO_DO_PAINEL }}
    >
      <TriangleAlert className="size-16 text-[#fab219]" aria-hidden />
      <p className="text-4xl font-semibold">{mensagem}</p>
      {detalhe && <p className="text-2xl max-w-3xl text-white/60">{detalhe}</p>}
    </div>
  );
}

/** Espera do primeiro carregamento. */
export function CarregandoPainel() {
  return (
    <div
      className="text-3xl fixed inset-0 z-[80] flex items-center justify-center text-white/60"
      style={{ backgroundColor: FUNDO_DO_PAINEL }}
    >
      Carregando o painel…
    </div>
  );
}
