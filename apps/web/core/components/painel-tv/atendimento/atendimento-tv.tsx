/**
 * Painel de TV do atendimento: as seis abas do `chatger` do SAC, que TROCAM
 * SOZINHAS a cada X segundos (padrão 15, `?intervalo=` na URL), com a barra de
 * progresso da troca, e a lateral com os atendentes que estão em alguma fila.
 *
 * A espera longa muda de cor E ganha rótulo: "aguardando há 21min" continua
 * legível para quem não distingue vermelho de amarelo.
 */
import { Users } from "lucide-react";
import {
  COR_DA_URGENCIA,
  COR_DO_ATENDENTE,
  FUNDO_DO_CARTAO,
  FUNDO_DO_PAINEL,
  ROTULO_DO_ATENDENTE,
  STATUS,
} from "../cores";
import { formatDuracao, formatDataHora, readUrgenciaDaEspera } from "../painel-helpers";
import { useRolagemAutomatica } from "../use-painel-tv";

export type TLinhaDoAtendimento = {
  id: string;
  protocolo: string;
  canal: string;
  aberto_em: string;
  contato: string;
  cliente: string | null;
  entidade: string | null;
  sistema: string | null;
  atendente: string | null;
  tempo_seg: number;
  tempo_tipo: "espera" | "parado" | "duracao";
};

export type TAbaDoAtendimento = {
  chave: string;
  rotulo: string;
  total: number;
  linhas: TLinhaDoAtendimento[];
};

export type TAtendenteDoPainel = {
  id: string;
  name: string;
  situacao: string;
  em_atendimento: number;
  aguardando: number;
};

export type TPainelDeAtendimento = {
  gerado_em: string;
  abas: TAbaDoAtendimento[];
  atendentes: TAtendenteDoPainel[];
  totais: { abertas: number; encerradas_hoje: number; atendentes_online: number };
};

const ROTULO_DO_TEMPO: Record<TLinhaDoAtendimento["tempo_tipo"], string> = {
  espera: "Esperando",
  parado: "Parado",
  duracao: "Durou",
};

const CANAIS: Record<string, string> = { whatsapp: "WhatsApp", native: "Site", phone: "Ligação" };

function TempoDaLinha({ linha }: { linha: TLinhaDoAtendimento }) {
  const urgencia = linha.tempo_tipo === "duracao" ? "normal" : readUrgenciaDaEspera(linha.tempo_seg);
  return (
    <span className="font-semibold whitespace-nowrap tabular-nums" style={{ color: COR_DA_URGENCIA[urgencia] }}>
      {ROTULO_DO_TEMPO[linha.tempo_tipo]} {formatDuracao(linha.tempo_seg)}
    </span>
  );
}

function TabelaDaAba({ aba }: { aba: TAbaDoAtendimento }) {
  const corpo = useRolagemAutomatica<HTMLDivElement>(aba.chave + aba.linhas.length);

  if (aba.linhas.length === 0) {
    return <p className="text-3xl px-2 py-12 text-center text-white/40">Nenhuma conversa nesta situação</p>;
  }

  return (
    <div ref={corpo} className="min-h-0 flex-1 overflow-hidden">
      <table className="text-xl w-full border-collapse">
        <thead className="sticky top-0 z-10" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
          <tr className="text-lg text-left tracking-wide text-white/50 uppercase">
            <th className="px-3 py-2">Protocolo</th>
            <th className="px-3 py-2">Abertura</th>
            <th className="px-3 py-2">Contato</th>
            <th className="px-3 py-2">Entidade</th>
            <th className="px-3 py-2">Sistema</th>
            <th className="px-3 py-2">Atendente</th>
            <th className="px-3 py-2 text-right">Tempo</th>
          </tr>
        </thead>
        <tbody>
          {aba.linhas.map((linha) => (
            <tr key={linha.id} className="border-t border-white/10">
              <td className="font-mono text-2xl px-3 py-3 font-semibold tabular-nums">{linha.protocolo}</td>
              <td className="px-3 py-3 text-white/60">
                {formatDataHora(linha.aberto_em)}
                <span className="text-lg ml-2 text-white/40">{CANAIS[linha.canal] ?? linha.canal}</span>
              </td>
              <td className="px-3 py-3">
                <span className="block truncate text-white/90">{linha.contato}</span>
                {linha.cliente && <span className="text-lg block truncate text-white/40">{linha.cliente}</span>}
              </td>
              <td className="max-w-[16rem] truncate px-3 py-3 text-white/70">{linha.entidade ?? "—"}</td>
              <td className="px-3 py-3 text-white/70">{linha.sistema ?? "—"}</td>
              <td className="px-3 py-3 text-white/70">{linha.atendente ?? "—"}</td>
              <td className="px-3 py-3 text-right">
                <TempoDaLinha linha={linha} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LateralDeAtendentes({ atendentes }: { atendentes: TAtendenteDoPainel[] }) {
  const lista = useRolagemAutomatica<HTMLUListElement>(atendentes.length);
  return (
    <aside className="flex w-[22rem] shrink-0 flex-col rounded-2xl bg-white/5">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <Users className="size-6 text-white/60" aria-hidden />
        <h2 className="text-2xl font-semibold">Atendentes</h2>
      </header>
      <ul ref={lista} className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
        {atendentes.map((pessoa) => (
          <li
            key={pessoa.id}
            className="flex items-center gap-3 rounded-xl px-3 py-2"
            style={{ backgroundColor: FUNDO_DO_CARTAO }}
          >
            <span
              className="inline-block size-4 shrink-0 rounded-full"
              style={{ backgroundColor: COR_DO_ATENDENTE[pessoa.situacao] ?? COR_DO_ATENDENTE.offline }}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="text-xl block truncate">{pessoa.name}</span>
              <span className="text-base block text-white/50">
                {ROTULO_DO_ATENDENTE[pessoa.situacao] ?? pessoa.situacao}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="text-2xl block font-bold tabular-nums">{pessoa.em_atendimento}</span>
              {pessoa.aguardando > 0 && (
                <span className="text-base block font-semibold" style={{ color: STATUS.atencao }}>
                  {pessoa.aguardando} esperando
                </span>
              )}
            </span>
          </li>
        ))}
        {atendentes.length === 0 && <li className="text-xl p-4 text-center text-white/40">Ninguém em fila</li>}
      </ul>
    </aside>
  );
}

type Props = {
  painel: TPainelDeAtendimento;
  indice: number;
  progresso: number;
  aoEscolher: (indice: number) => void;
};

export function AtendimentoDaTv({ painel, indice, progresso, aoEscolher }: Props) {
  const aba = painel.abas[indice] ?? painel.abas[0];

  return (
    <div className="flex h-full min-h-0 gap-4">
      <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/5">
        <nav className="flex shrink-0 flex-wrap gap-2 border-b border-white/10 p-3">
          {painel.abas.map((item, i) => (
            <button
              key={item.chave}
              type="button"
              onClick={() => aoEscolher(i)}
              className={`text-2xl flex items-center gap-2 rounded-xl px-4 py-2 transition ${
                i === indice ? "font-semibold" : "bg-white/5 text-white/70"
              }`}
              // A aba escolhida inverte as cores; em estilo, e não em classe, porque
              // a paleta do produto não tem os tons neutros do Tailwind.
              style={i === indice ? { backgroundColor: "#ffffff", color: FUNDO_DO_PAINEL } : undefined}
            >
              {item.rotulo}
              <span
                className="text-xl rounded-lg px-2 py-0.5 font-bold tabular-nums"
                style={{ backgroundColor: i === indice ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)" }}
              >
                {item.total}
              </span>
            </button>
          ))}
        </nav>
        <div className="h-1 shrink-0 bg-white/10">
          <div className="h-1 bg-white/60 transition-[width] duration-100" style={{ width: `${progresso * 100}%` }} />
        </div>
        {aba ? <TabelaDaAba aba={aba} /> : null}
      </section>
      <LateralDeAtendentes atendentes={painel.atendentes} />
    </div>
  );
}
