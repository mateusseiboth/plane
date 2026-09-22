/**
 * Atalhos dos painéis de TV na tela de Relatórios.
 *
 * Cada cartão abre o painel em NOVA ABA: quem está logado entra direto (a API
 * aceita a sessão de quem vê relatórios). O link com a chave, que é o que vai
 * para a TV, sai na tela de Configurações > Painéis de TV — a chave aparece uma
 * única vez, na criação, e nem esta tela consegue lê-la depois.
 */
import { useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, type LucideIcon } from "lucide-react";
import { Database, Map, MonitorCheck, MonitorPlay, Headset } from "lucide-react";
import { PAINEIS_DA_TV, type PainelDaTv } from "@/components/painel-tv/painel-helpers";

const DESCRICAO: Record<PainelDaTv, string> = {
  ti: "Pendente, atribuído, em desenvolvimento, concluído e enviado, com alerta de cliente parado.",
  qualidade: "Verificar, analisar e homologar, com a fatia de cada etapa.",
  atendimento: "As conversas do chat por situação, com as abas trocando sozinhas.",
  mapa: "Mato Grosso do Sul com os chamados abertos de cada entidade e os backups atrasados.",
  backups: "Quem está sem backup e os envios do dia, sistema por sistema.",
};

const ICONE: Record<PainelDaTv, LucideIcon> = {
  ti: MonitorPlay,
  qualidade: MonitorCheck,
  atendimento: Headset,
  mapa: Map,
  backups: Database,
};

function BotaoDeCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-subtle px-2 py-1 text-12 text-secondary hover:text-primary"
      onClick={(evento) => {
        evento.preventDefault();
        void navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copiado ? "Copiado" : "Copiar link"}
    </button>
  );
}

export function PaineisDeTvDosRelatorios({ workspaceSlug }: { workspaceSlug: string }) {
  const base = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-14 font-semibold text-primary">Painéis de TV</h2>
          <p className="text-12 text-tertiary">Telas de parede, em tempo real. Abrem em uma aba nova.</p>
        </div>
        <a
          href={`/${workspaceSlug}/settings/paineis-tv`}
          className="inline-flex items-center gap-1 rounded-md border border-subtle px-3 py-1.5 text-12 text-secondary hover:text-primary"
        >
          <KeyRound className="size-3.5" />
          Chaves e links para TV
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {PAINEIS_DA_TV.map((painel) => {
          const Icone = ICONE[painel.chave];
          const endereco = `/${workspaceSlug}/painel/${painel.chave}`;
          return (
            <a
              key={painel.chave}
              href={endereco}
              target="_blank"
              rel="noopener"
              className="group hover:border-accent-primary flex w-full items-start gap-3 rounded-lg border border-subtle bg-surface-1 p-4 text-left transition-colors hover:bg-surface-2"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-accent-primary group-hover:bg-surface-1">
                <Icone className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-13 font-semibold text-primary">{painel.titulo}</h3>
                  <ExternalLink className="h-4 w-4 shrink-0 text-tertiary" />
                </div>
                <p className="mt-1 text-12 leading-snug text-secondary">{DESCRICAO[painel.chave]}</p>
                <div className="mt-2">
                  <BotaoDeCopiar texto={`${base}${endereco}`} />
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
