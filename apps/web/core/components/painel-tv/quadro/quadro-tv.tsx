/**
 * Painel de TV do TI e da Qualidade: uma coluna por etapa, com a contagem e o
 * percentual no cabeçalho (como o "Verificar (8%) (11/134)" do SAC) e um cartão
 * por chamado.
 *
 * Cada cartão mostra o que dá para ler a cinco metros: o ícone do sistema, o
 * NÚMERO ANUAL do chamado bem grande e o título em duas linhas. Urgente
 * ("cliente parado") ganha borda vermelha pulsante e a palavra escrita — cor
 * sozinha não avisa ninguém.
 */
import { Logo } from "@plane/propel/emoji-icon-picker";
import type { TLogoProps } from "@plane/types";
import { corDaColuna, COR_DA_PRIORIDADE, FUNDO_DO_CARTAO, ROTULO_DA_PRIORIDADE, STATUS } from "../cores";
import { useRolagemAutomatica } from "../use-painel-tv";

export type TChamadoDoPainel = {
  id: string;
  ticket_number: string | null;
  identifier: string | null;
  name: string;
  project: string | null;
  project_identifier: string | null;
  project_logo: TLogoProps | null;
  entity: string | null;
  priority: string;
  tipo: string;
  age_days: number;
  responsaveis: string[];
};

export type TColunaDoQuadro = {
  chave: string;
  rotulo: string;
  cor: string;
  total: number;
  percentual: number | null;
  chamados: TChamadoDoPainel[];
};

export type TQuadroDaTv = {
  painel: string;
  gerado_em: string;
  total: number;
  colunas: TColunaDoQuadro[];
  urgentes: TChamadoDoPainel[];
};

const isUrgente = (chamado: TChamadoDoPainel) => chamado.priority === "urgent";

function IconeDoSistema({ chamado }: { chamado: TChamadoDoPainel }) {
  if (chamado.project_logo?.in_use) {
    return (
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Logo logo={chamado.project_logo} size={26} />
      </span>
    );
  }
  return (
    <span className="text-base flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 font-bold text-white/80">
      {(chamado.project_identifier ?? chamado.project ?? "?").slice(0, 3).toUpperCase()}
    </span>
  );
}

function CartaoDoChamado({ chamado }: { chamado: TChamadoDoPainel }) {
  const urgente = isUrgente(chamado);
  return (
    <li
      className={`rounded-xl border-l-8 px-4 py-3 ${urgente ? "animate-pulse" : ""}`}
      style={{
        backgroundColor: urgente ? "rgba(208, 59, 59, 0.16)" : FUNDO_DO_CARTAO,
        borderLeftColor: COR_DA_PRIORIDADE[chamado.priority] ?? COR_DA_PRIORIDADE.none,
      }}
    >
      <div className="flex items-start gap-3">
        <IconeDoSistema chamado={chamado} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-3xl font-bold tracking-tight tabular-nums">
              {chamado.ticket_number ?? chamado.identifier ?? "—"}
            </span>
            <span className="text-lg shrink-0 text-white/50">{chamado.age_days}d</span>
          </div>
          <p className="text-xl mt-1 line-clamp-2 leading-snug font-medium text-white/90">{chamado.name}</p>
          <p className="text-lg mt-1 truncate text-white/50">
            {[chamado.project, chamado.entity].filter(Boolean).join(" · ") || "—"}
          </p>
          {chamado.responsaveis.length > 0 && (
            <p className="text-lg truncate text-white/40">{chamado.responsaveis.join(", ")}</p>
          )}
          {urgente && (
            <p className="text-lg mt-1 font-semibold" style={{ color: STATUS.critico }}>
              {ROTULO_DA_PRIORIDADE.urgent}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function ColunaDoQuadro({ coluna }: { coluna: TColunaDoQuadro }) {
  const cor = corDaColuna(coluna.cor);
  const lista = useRolagemAutomatica<HTMLUListElement>(coluna.chamados.map((c) => c.id).join(","));

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-2xl bg-white/5">
      <header className="rounded-t-2xl px-4 py-3" style={{ backgroundColor: cor }}>
        <h2 className="text-2xl truncate font-semibold text-white">
          {coluna.rotulo}
          {coluna.percentual !== null && <span className="text-xl ml-2 opacity-80">({coluna.percentual}%)</span>}
        </h2>
        <p className="text-4xl font-bold text-white tabular-nums">{coluna.total}</p>
      </header>
      <ul ref={lista} className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        {coluna.chamados.length === 0 ? (
          <li className="text-xl px-2 py-6 text-center text-white/40">Nada aqui</li>
        ) : (
          coluna.chamados.map((chamado) => <CartaoDoChamado key={chamado.id} chamado={chamado} />)
        )}
      </ul>
    </section>
  );
}

export function QuadroDaTv({ quadro }: { quadro: TQuadroDaTv }) {
  return (
    <div className="flex h-full min-h-0 gap-4">
      {quadro.colunas.map((coluna) => (
        <ColunaDoQuadro key={coluna.chave} coluna={coluna} />
      ))}
    </div>
  );
}
