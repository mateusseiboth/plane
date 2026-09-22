/**
 * Barra de filtros do painel de backups. Só aparece para quem está usando o
 * painel (logado, ou com `?interativo=1`): na parede ninguém clica em nada.
 *
 * Cada escolha vai para a URL, então o filtro que a infra montou se manda por
 * link e chega igual do outro lado.
 */
import { Search, X } from "lucide-react";
import { FUNDO_DO_CARTAO } from "../cores";
import {
  ORDENS_DO_BACKUP,
  ROTULO_DA_ORDEM,
  ROTULO_DA_SITUACAO,
  SISTEMAS_DO_BACKUP,
  SITUACOES_DO_BACKUP,
  isSituacaoDoBackup,
  type FiltrosDoBackup,
  type OrdemDoBackup,
} from "./backups-helpers";

type Props = {
  filtros: FiltrosDoBackup;
  dias: number;
  aoFiltrar: (parciais: Partial<FiltrosDoBackup>) => void;
  aoTrocarDias: (dias: number) => void;
};

const CAIXA = "rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-lg text-white";

/** `<select>` cru: a página roda fora do layout do produto, sem os componentes dele. */
function Escolha({
  rotulo,
  valor,
  aoMudar,
  children,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-base text-white/60">{rotulo}</span>
      <select className={CAIXA} value={valor} onChange={(evento) => aoMudar(evento.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function FiltrosDeBackup({ filtros, dias, aoFiltrar, aoTrocarDias }: Props) {
  const temFiltro = filtros.entidade !== "" || filtros.sistema !== null || filtros.situacao !== null;

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-3 rounded-xl px-4 py-3"
      style={{ backgroundColor: FUNDO_DO_CARTAO }}
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-white/40"
          aria-hidden
        />
        <input
          type="search"
          className={`${CAIXA} w-72 pl-10`}
          placeholder="Buscar entidade ou código"
          value={filtros.entidade}
          onChange={(evento) => aoFiltrar({ entidade: evento.target.value })}
          aria-label="Buscar entidade ou código"
        />
      </div>

      <Escolha
        rotulo="Sistema"
        valor={filtros.sistema === null ? "" : String(filtros.sistema)}
        aoMudar={(valor) => aoFiltrar({ sistema: valor === "" ? null : Number(valor) })}
      >
        <option value="">Todos</option>
        {SISTEMAS_DO_BACKUP.map((sistema) => (
          <option key={sistema.codigo} value={sistema.codigo}>
            {sistema.nome}
          </option>
        ))}
      </Escolha>

      <Escolha
        rotulo="Situação"
        valor={filtros.situacao ?? ""}
        aoMudar={(valor) => aoFiltrar({ situacao: isSituacaoDoBackup(valor) ? valor : null })}
      >
        <option value="">Todas</option>
        {SITUACOES_DO_BACKUP.map((situacao) => (
          <option key={situacao} value={situacao}>
            {ROTULO_DA_SITUACAO[situacao]}
          </option>
        ))}
      </Escolha>

      <Escolha rotulo="Ordem" valor={filtros.ordem} aoMudar={(valor) => aoFiltrar({ ordem: valor as OrdemDoBackup })}>
        {ORDENS_DO_BACKUP.map((ordem) => (
          <option key={ordem} value={ordem}>
            {ROTULO_DA_ORDEM[ordem]}
          </option>
        ))}
      </Escolha>

      <label className="flex items-center gap-2">
        <span className="text-base text-white/60">Janela</span>
        <input
          type="number"
          min={1}
          max={30}
          className={`${CAIXA} w-24`}
          value={dias}
          onChange={(evento) => aoTrocarDias(Number(evento.target.value))}
          aria-label="Janela em dias"
        />
        <span className="text-base text-white/60">dia(s)</span>
      </label>

      {temFiltro && (
        <button
          type="button"
          onClick={() => aoFiltrar({ entidade: "", sistema: null, situacao: null })}
          className="text-base flex items-center gap-1 rounded-lg border border-white/20 px-3 py-2 text-white/70 transition hover:text-white"
        >
          <X className="size-4" aria-hidden />
          Limpar filtros
        </button>
      )}
    </div>
  );
}
