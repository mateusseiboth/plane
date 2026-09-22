/**
 * Painel de TV do mapa: onde estão os chamados abertos, entidade por entidade.
 *
 * Lateral, na ordem em que o operador olha: os números do topo, os backups
 * atrasados (o que exige ação hoje), as entidades com mais chamados e, por
 * último, quem o mapa não soube posicionar.
 */
import { useEffect, useState } from "react";
import { Database, MapPin, TriangleAlert } from "lucide-react";
import { COR_DA_GRAVIDADE, FUNDO_DO_CARTAO, STATUS } from "../cores";
import { useRolagemAutomatica } from "../use-painel-tv";
import { MapaDeMs } from "./mapa-de-ms";

export type TEntidadeDoPonto = {
  id: string;
  nome: string;
  abertos: number;
  urgentes: number;
  backup_atrasado: boolean;
  servidor: "online" | "offline" | null;
};

export type TPontoDoMapa = {
  chave: string;
  ibge: number | null;
  cidade: string;
  uf: string;
  lat: number;
  lon: number;
  abertos: number;
  urgentes: number;
  backups_atrasados: number;
  servidores_offline: number;
  entidades: TEntidadeDoPonto[];
};

export type TPainelDoMapa = {
  gerado_em: string;
  pontos: TPontoDoMapa[];
  sem_localizacao: { id: string; nome: string; cidade: string | null; uf: string | null; abertos: number }[];
  total_abertos: number;
  total_urgentes: number;
  total_entidades: number;
  servidores_offline: number;
  top_entidades: { id: string; nome: string; cidade: string | null; abertos: number; urgentes: number }[];
  backups: {
    total: number;
    itens: {
      entity_id: string;
      entidade: string;
      sistema: string;
      ultimo_em: string | null;
      dias: number | null;
      gravidade: string;
    }[];
  };
};

const TROCA_DO_DESTAQUE_MS = 6_000;

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
      <p className="text-5xl font-bold tabular-nums" style={{ color: cor ?? "#ffffff" }}>
        {valor}
      </p>
      <p className="text-lg text-white/60">{rotulo}</p>
    </div>
  );
}

function ListaDeBackups({ backups }: { backups: TPainelDoMapa["backups"] }) {
  const lista = useRolagemAutomatica<HTMLUListElement>(backups.itens.length);
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/5">
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <h2 className="text-xl flex items-center gap-2 font-semibold">
          <Database className="size-5 text-white/60" aria-hidden />
          Backup atrasado
        </h2>
        <span className="text-xl font-bold tabular-nums">{backups.total}</span>
      </header>
      <ul ref={lista} className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
        {backups.itens.length === 0 ? (
          <li className="text-lg p-3 text-center text-white/40">Sem dados de backup</li>
        ) : (
          backups.itens.map((item) => (
            <li
              key={`${item.entity_id}-${item.sistema}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={{ backgroundColor: FUNDO_DO_CARTAO }}
            >
              <span
                className="inline-block size-3 shrink-0 rounded-full"
                style={{ backgroundColor: COR_DA_GRAVIDADE[item.gravidade] ?? STATUS.atencao }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="text-lg block truncate">{item.entidade}</span>
                <span className="text-base block truncate text-white/50">{item.sistema}</span>
              </span>
              <span className="text-base shrink-0 text-right" style={{ color: COR_DA_GRAVIDADE[item.gravidade] }}>
                {item.dias === null ? "Sem registro" : `Último: ${item.dias} dias`}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

export function MapaDaTv({ painel }: { painel: TPainelDoMapa }) {
  const [destacado, setDestacado] = useState<string | null>(null);
  const semLocalizacao = useRolagemAutomatica<HTMLUListElement>(painel.sem_localizacao.length);

  // O destaque passeia pelas cidades com mais chamados: de longe, é o que puxa
  // o olho para onde a fila está crescendo.
  useEffect(() => {
    const comChamado = painel.pontos.filter((p) => p.abertos > 0);
    if (comChamado.length === 0) return;
    let indice = 0;
    setDestacado(comChamado[0]!.chave);
    const rodizio = setInterval(() => {
      indice = (indice + 1) % comChamado.length;
      setDestacado(comChamado[indice]!.chave);
    }, TROCA_DO_DESTAQUE_MS);
    return () => clearInterval(rodizio);
  }, [painel.pontos]);

  const emDestaque = painel.pontos.find((p) => p.chave === destacado) ?? null;

  return (
    <div className="flex h-full min-h-0 gap-4">
      <div className="relative min-h-0 flex-1 rounded-2xl bg-white/5 p-2">
        <MapaDeMs pontos={painel.pontos} destacado={destacado} />
        {emDestaque && (
          <div
            className="shadow-lg absolute bottom-4 left-4 max-w-sm rounded-xl px-4 py-3"
            style={{ backgroundColor: FUNDO_DO_CARTAO }}
          >
            <p className="text-2xl font-semibold">
              {emDestaque.cidade}/{emDestaque.uf}
            </p>
            <ul className="text-lg mt-1 space-y-0.5 text-white/70">
              {emDestaque.entidades.slice(0, 4).map((entidade) => (
                <li key={entidade.id} className="flex items-center gap-2">
                  <span className="tabular-nums">{entidade.abertos}</span>
                  <span className="truncate">{entidade.nome}</span>
                  {entidade.servidor === "offline" && (
                    <span className="text-base shrink-0 font-semibold" style={{ color: STATUS.critico }}>
                      servidor offline
                    </span>
                  )}
                  {entidade.backup_atrasado && (
                    <span className="text-base shrink-0 font-semibold" style={{ color: STATUS.atencao }}>
                      backup atrasado
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <aside className="flex w-[26rem] shrink-0 flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Numero rotulo="Chamados abertos" valor={painel.total_abertos} />
          <Numero rotulo="Urgentes" valor={painel.total_urgentes} cor={STATUS.critico} />
          <Numero rotulo="Entidades" valor={painel.total_entidades} />
          <Numero
            rotulo="Servidores offline"
            valor={painel.servidores_offline}
            cor={painel.servidores_offline > 0 ? STATUS.critico : undefined}
          />
        </div>

        <ListaDeBackups backups={painel.backups} />

        <section className="rounded-2xl bg-white/5">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <TriangleAlert className="size-5 text-white/60" aria-hidden />
            <h2 className="text-xl font-semibold">Mais chamados abertos</h2>
          </header>
          <ul className="space-y-1 p-2">
            {painel.top_entidades.slice(0, 5).map((entidade) => (
              <li
                key={entidade.id}
                className="flex items-center gap-3 rounded-lg px-3 py-1.5"
                style={{ backgroundColor: FUNDO_DO_CARTAO }}
              >
                <span className="text-2xl w-10 shrink-0 font-bold tabular-nums">{entidade.abertos}</span>
                <span className="text-lg min-w-0 flex-1 truncate">{entidade.nome}</span>
                {entidade.urgentes > 0 && (
                  <span className="text-base shrink-0 font-semibold" style={{ color: STATUS.critico }}>
                    {entidade.urgentes} urgente(s)
                  </span>
                )}
              </li>
            ))}
            {painel.top_entidades.length === 0 && (
              <li className="text-lg p-3 text-center text-white/40">Nenhum chamado aberto</li>
            )}
          </ul>
        </section>

        <section className="flex max-h-48 min-h-0 flex-col rounded-2xl bg-white/5">
          <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
            <h2 className="text-xl flex items-center gap-2 font-semibold">
              <MapPin className="size-5 text-white/60" aria-hidden />
              Sem localização
            </h2>
            <span className="text-xl font-bold tabular-nums">{painel.sem_localizacao.length}</span>
          </header>
          <ul ref={semLocalizacao} className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
            {painel.sem_localizacao.length === 0 ? (
              <li className="text-lg p-2 text-center text-white/40">Todas as entidades no mapa</li>
            ) : (
              painel.sem_localizacao.map((entidade) => (
                <li key={entidade.id} className="text-lg flex items-center gap-2 px-2 text-white/70">
                  <span className="w-8 shrink-0 tabular-nums">{entidade.abertos}</span>
                  <span className="min-w-0 flex-1 truncate">{entidade.nome}</span>
                  <span className="text-base shrink-0 text-white/40">
                    {[entidade.cidade, entidade.uf].filter(Boolean).join("/") || "sem cidade"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </aside>
    </div>
  );
}
