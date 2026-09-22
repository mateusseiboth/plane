/**
 * Painel de TV do setor (TI ou Qualidade) em tela cheia: colunas por etapa,
 * chamados de cada pessoa do setor e alerta de urgente com som.
 */
import { Bell, BellOff, Maximize, X } from "lucide-react";
import { cn } from "@plane/utils";
import { ChamadoRef } from "@/components/reports/renderers-chamados";
import { useAlertaSonoro, usePainelTv, useRelogio } from "./use-painel-tv";

type TChamadoDoPainel = {
  id: string;
  ticket_number: string | null;
  identifier: string | null;
  name: string;
  project: string | null;
  entity: string | null;
  priority: string;
  tipo: string;
  state: string | null;
  age_days: number;
  responsaveis: string[];
};

type TPainel = {
  titulo: string;
  total: number;
  gerado_em: string;
  colunas: { chave: string; rotulo: string; total: number; percentual: number; chamados: TChamadoDoPainel[] }[];
  por_pessoa: { user_id: string; name: string; chamados: TChamadoDoPainel[] }[];
  alertas: TChamadoDoPainel[];
};

/** Cor da borda pelo tipo, como no painel do SAC (correção vermelha, melhoria azul). */
const BORDA_DO_TIPO: Record<string, string> = {
  correcao: "border-l-red-500",
  melhoria: "border-l-blue-500",
  projeto: "border-l-violet-500",
  outros: "border-l-neutral-400",
};

const ROTULO_DAS_PESSOAS: Record<string, string> = { ti: "Por desenvolvedor", qualidade: "Por analista" };

const telaCheia = () => void document.documentElement.requestFullscreen?.();

const formatHora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function CartaoDoChamado({ chamado }: { chamado: TChamadoDoPainel }) {
  return (
    <li
      className={cn(
        "rounded-md border border-l-4 border-subtle bg-surface-1 px-3 py-2",
        BORDA_DO_TIPO[chamado.tipo] ?? BORDA_DO_TIPO.outros,
        chamado.priority === "urgent" && "border-red-500 bg-red-500/10"
      )}
    >
      <div className="flex items-baseline justify-between gap-2 text-14">
        <ChamadoRef row={chamado} />
        <span className="text-12 text-tertiary">{chamado.age_days} d</span>
      </div>
      <p className="text-15 mt-1 line-clamp-2 font-medium text-primary">{chamado.name}</p>
      <p className="mt-1 truncate text-12 text-secondary">
        {[chamado.project, chamado.entity].filter(Boolean).join(" · ")}
      </p>
      {chamado.responsaveis.length > 0 && (
        <p className="truncate text-12 text-tertiary">{chamado.responsaveis.join(", ")}</p>
      )}
    </li>
  );
}

type Props = { workspaceSlug: string; setor: string; onSair: () => void; onTrocarSetor: (setor: string) => void };

export function PainelTv({ workspaceSlug, setor, onSair, onTrocarSetor }: Props) {
  const { data, error, isLoading } = usePainelTv(workspaceSlug, setor, []);
  const painel = data as TPainel | undefined;
  const { somAtivo, ativarSom, desativarSom } = useAlertaSonoro((painel?.alertas ?? []).map((c) => c.id));
  const agora = useRelogio();

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-surface-2 text-primary">
      <header className="flex items-center justify-between gap-4 border-b border-subtle bg-surface-1 px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">{painel?.titulo ?? "Painel"}</h1>
          <nav className="flex gap-1">
            {[
              { valor: "ti", rotulo: "TI" },
              { valor: "qualidade", rotulo: "Qualidade" },
            ].map((opcao) => (
              <button
                key={opcao.valor}
                onClick={() => onTrocarSetor(opcao.valor)}
                className={cn(
                  "rounded px-3 py-1 text-13",
                  opcao.valor === setor ? "bg-accent-primary text-on-color" : "text-secondary hover:bg-surface-2"
                )}
              >
                {opcao.rotulo}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          {painel && (
            <span className="text-12 text-tertiary">Atualizado às {formatHora(new Date(painel.gerado_em))}</span>
          )}
          <span className="text-3xl font-semibold tabular-nums">{formatHora(agora)}</span>
          <button
            onClick={somAtivo ? desativarSom : ativarSom}
            className="inline-flex items-center gap-1.5 rounded border border-subtle px-3 py-2 text-13"
          >
            {somAtivo ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            {somAtivo ? "Som ativo" : "Ativar som"}
          </button>
          <button onClick={telaCheia} className="rounded border border-subtle p-2" title="Tela cheia">
            <Maximize className="h-4 w-4" />
          </button>
          <button onClick={onSair} className="rounded border border-subtle p-2" title="Sair do painel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {painel && painel.alertas.length > 0 && (
        <div className="bg-red-600 animate-pulse px-6 py-3 text-on-color" role="alert">
          <p className="text-lg font-semibold">Urgente aguardando: {painel.alertas.length}</p>
          <p className="truncate text-14">
            {painel.alertas.map((c) => `${c.ticket_number ?? c.identifier} ${c.name}`).join(" · ")}
          </p>
        </div>
      )}

      {isLoading && <p className="text-lg p-10 text-center text-secondary">Carregando painel...</p>}
      {error && (
        <p className="text-lg p-10 text-center text-secondary">
          {(error as { detail?: string }).detail ?? "Não foi possível carregar o painel."}
        </p>
      )}

      {painel && (
        <main className="grid flex-1 grid-cols-4 gap-4 overflow-hidden p-4">
          {painel.colunas.map((coluna) => (
            <section key={coluna.chave} className="flex min-h-0 flex-col rounded-lg bg-surface-1 p-3">
              <h2 className="text-lg mb-2 flex items-baseline justify-between font-semibold">
                {coluna.rotulo}
                <span className="font-normal text-14 text-secondary">
                  {coluna.total} ({coluna.percentual}%)
                </span>
              </h2>
              <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                {coluna.chamados.map((chamado) => (
                  <CartaoDoChamado key={chamado.id} chamado={chamado} />
                ))}
                {!coluna.chamados.length && <li className="text-14 text-tertiary">Nenhum chamado.</li>}
              </ul>
            </section>
          ))}

          <section className="flex min-h-0 flex-col rounded-lg bg-surface-1 p-3">
            <h2 className="text-lg mb-2 font-semibold">{ROTULO_DAS_PESSOAS[setor] ?? "Por pessoa"}</h2>
            <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {painel.por_pessoa.map((pessoa) => (
                <li key={pessoa.user_id}>
                  <p className="text-15 flex justify-between font-semibold">
                    {pessoa.name}
                    <span className="text-secondary">{pessoa.chamados.length}</span>
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5 text-13">
                    {pessoa.chamados.map((c) => (
                      <li key={c.id} className="flex justify-between gap-2 text-secondary">
                        <span className="truncate">
                          {c.ticket_number ?? c.identifier} {c.name}
                        </span>
                        <span className="shrink-0 text-tertiary">{c.state}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {!painel.por_pessoa.length && <li className="text-14 text-tertiary">Ninguém do setor com chamado.</li>}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}
