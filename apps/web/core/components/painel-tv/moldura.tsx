/**
 * A moldura de todo painel de TV: fundo escuro, cabeçalho com o título, o nome
 * do espaço, o relógio, o selo "ao vivo" e a hora da última atualização, mais o
 * rodapé com a legenda.
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

export function MolduraDoPainel({
  titulo,
  espaco,
  agora,
  idadeDosDados,
  aoVivo,
  som,
  acoes,
  legenda,
  children,
}: Props) {
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col overflow-hidden text-white"
      style={{ backgroundColor: FUNDO_DO_PAINEL }}
    >
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-white/10 px-8 py-4">
        <div className="min-w-0">
          <h1 className="text-4xl truncate font-semibold tracking-tight">{titulo}</h1>
          {espaco && <p className="text-xl mt-1 truncate text-white/60">{espaco}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-6">
          {acoes}
          <div className="text-lg flex items-center gap-2">
            <span
              className={`inline-block size-3 rounded-full ${aoVivo ? "animate-pulse bg-[#0ca30c]" : "bg-[#d03b3b]"}`}
              aria-hidden
            />
            <span className="text-white/70">{aoVivo ? "Ao vivo" : "Sem conexão"}</span>
          </div>
          <div className="text-lg flex items-center gap-2 text-white/60">
            <RefreshCw className="size-5" aria-hidden />
            <span>há {formatDuracao(idadeDosDados)}</span>
          </div>
          {som && (
            <button
              type="button"
              onClick={som.ativo ? som.desativar : som.ativar}
              className={`text-lg rounded-lg border px-3 py-2 transition ${
                som.querSom ? "animate-pulse border-[#fab219] text-[#fab219]" : "border-white/20 text-white/70"
              }`}
              title={som.ativo ? "Desativar o som do alerta" : "Ativar o som do alerta"}
            >
              {som.ativo ? <Bell className="size-6" /> : <BellOff className="size-6" />}
            </button>
          )}
          <button
            type="button"
            onClick={telaCheia}
            className="rounded-lg border border-white/20 px-3 py-2 text-white/70 transition hover:text-white"
            title="Tela cheia"
          >
            <Maximize className="size-6" />
          </button>
          <time className="font-mono text-5xl font-semibold tabular-nums">{formatHora(agora)}</time>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden px-8 py-6">{children}</main>

      {legenda && (
        <footer className="text-base flex shrink-0 flex-wrap items-center gap-6 border-t border-white/10 px-8 py-3 text-white/60">
          {legenda}
        </footer>
      )}
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
