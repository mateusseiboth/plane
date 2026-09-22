/**
 * Painel de backups, no formato do relatório da intranet: primeiro quem está
 * sem backup, depois os envios do período com os quatro sinalizadores (banco,
 * FTP, erro de backup e erro de restauração).
 *
 * Verde é "está bom", vermelho é "não está" — e cada um vem com a palavra ao
 * lado, porque a TV é olhada de longe e nem todo mundo separa as duas cores.
 *
 * Duas vidas no mesmo componente:
 *  - na PAREDE (chave de painel, sem ninguém por perto) nada é clicável e as
 *    listas rolam sozinhas, como sempre foi;
 *  - com alguém USANDO (logado, ou `?interativo=1`) aparece a barra de filtros
 *    e cada linha entidade × sistema abre o histórico daquele backup.
 */
import { useMemo, useState } from "react";
import { Database } from "lucide-react";
import { FUNDO_DO_CARTAO, STATUS } from "../cores";
import { formatData, formatDataHora } from "../painel-helpers";
import { useRolagemAutomatica } from "../use-painel-tv";
import { filterPainelDeBackups, type FiltrosDoBackup, type TPainelDeBackups } from "./backups-helpers";
import { FiltrosDeBackup } from "./filtros-de-backup";
import { HistoricoDeBackups } from "./historico-de-backups";
import { useHistoricoDeBackups, usePluginDeBackup, type CelulaDoBackup } from "./use-backups";

export type { TBackupEnviado, TPainelDeBackups } from "./backups-helpers";

const ROTULO_DO_BANCO: Record<number, string> = {
  0: "Não corrompido",
  1: "Corrompido",
  2: "Não foi para o FTP",
};

type Props = {
  painel: TPainelDeBackups;
  workspaceSlug: string;
  chave: string | null;
  interativo: boolean;
  logado: boolean;
  filtros: FiltrosDoBackup;
  dias: number;
  aoFiltrar: (parciais: Partial<FiltrosDoBackup>) => void;
  aoTrocarDias: (dias: number) => void;
};

function Sinal({ ok, rotulo, valor }: { ok: boolean; rotulo: string; valor: string }) {
  return (
    <span className="text-base whitespace-nowrap">
      <span className="text-white/50">{rotulo} </span>
      <span className="font-semibold" style={{ color: ok ? STATUS.bom : STATUS.critico }}>
        {valor}
      </span>
    </span>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-xl px-5 py-3" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
      <p className="text-5xl font-bold tabular-nums" style={{ color: cor ?? "#ffffff" }}>
        {valor}
      </p>
      <p className="text-lg text-white/60">{rotulo}</p>
    </div>
  );
}

/** Na parede a linha é texto; para quem está usando, é botão. */
function Linha({
  aoAbrir,
  className,
  style,
  children,
}: {
  aoAbrir: (() => void) | null;
  className: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!aoAbrir) {
    return (
      <li className={className} style={style}>
        {children}
      </li>
    );
  }
  return (
    <li style={style} className={`${className} cursor-pointer transition hover:bg-white/10`}>
      <button type="button" onClick={aoAbrir} className="block w-full text-left">
        {children}
      </button>
    </li>
  );
}

export function BackupsDaTv({
  painel,
  workspaceSlug,
  chave,
  interativo,
  logado,
  filtros,
  dias,
  aoFiltrar,
  aoTrocarDias,
}: Props) {
  const [celula, setCelula] = useState<CelulaDoBackup | null>(null);
  const visivel = useMemo(
    () => (interativo ? filterPainelDeBackups(painel, filtros) : painel),
    [interativo, painel, filtros]
  );
  const semBackup = useRolagemAutomatica<HTMLUListElement>(interativo ? 0 : visivel.sem_backup.length);
  const enviados = useRolagemAutomatica<HTMLUListElement>(interativo ? 0 : visivel.enviados.length);
  const semFonte = painel.contadores.entidades_com_backup === 0 && painel.contadores.entidades_atrasadas === 0;

  const { historico, error, isLoading } = useHistoricoDeBackups(workspaceSlug, chave, celula);
  const plugin = usePluginDeBackup(logado);

  const abrir = (entidadeId: string, entidade: string, sistema: number | null) =>
    interativo ? () => setCelula({ entidadeId, entidade, sistema }) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {interativo && (
        <FiltrosDeBackup filtros={filtros} dias={dias} aoFiltrar={aoFiltrar} aoTrocarDias={aoTrocarDias} />
      )}

      <div className="flex shrink-0 flex-wrap gap-3">
        <Numero
          rotulo={`Sem backup há mais de ${painel.dias} dia(s)`}
          valor={visivel.contadores.entidades_atrasadas}
          cor={visivel.contadores.entidades_atrasadas > 0 ? STATUS.critico : undefined}
        />
        <Numero rotulo="Entidades que enviaram" valor={visivel.contadores.entidades_com_backup} />
        <Numero rotulo="Backups recebidos" valor={visivel.contadores.backups_recebidos} />
        <Numero
          rotulo="Com problema"
          valor={visivel.contadores.com_problema}
          cor={visivel.contadores.com_problema > 0 ? STATUS.critico : undefined}
        />
        <Numero rotulo="Maior atraso (dias)" valor={visivel.contadores.maior_atraso_dias} />
        {painel.uf && (
          <div
            className="text-3xl flex items-center rounded-xl px-5 py-3 font-semibold"
            style={{ backgroundColor: FUNDO_DO_CARTAO }}
          >
            {painel.uf}
          </div>
        )}
      </div>

      {semFonte && (
        <p className="text-xl shrink-0 rounded-xl px-4 py-3 text-white/60" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
          Sem dados de backup.
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        <section className="flex min-h-0 w-[34rem] shrink-0 flex-col rounded-2xl bg-white/5">
          <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <h2 className="text-2xl font-semibold">Entidades sem backup</h2>
            <span className="text-2xl font-bold tabular-nums">{visivel.sem_backup.length}</span>
          </header>
          <ul
            ref={interativo ? undefined : semBackup}
            className={`min-h-0 flex-1 space-y-1 p-2 ${interativo ? "overflow-y-auto" : "overflow-hidden"}`}
          >
            {visivel.sem_backup.length === 0 ? (
              <li className="text-xl p-4 text-center text-white/40">Ninguém atrasado</li>
            ) : (
              visivel.sem_backup.map((entidade) => (
                <Linha
                  key={entidade.id}
                  className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: FUNDO_DO_CARTAO }}
                  aoAbrir={abrir(entidade.id, entidade.nome, filtros.sistema)}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xl text-white/50">{entidade.codigo ?? "—"}</span>
                    <span className="text-xl min-w-0 flex-1 truncate">{entidade.nome}</span>
                    <span className="text-lg shrink-0 font-semibold" style={{ color: STATUS.critico }}>
                      {entidade.dias === null ? "Sem registro" : `${entidade.dias} dias`}
                    </span>
                  </div>
                  <div className="text-base flex items-baseline gap-4 text-white/50">
                    <span className="truncate">
                      {[entidade.cidade, entidade.uf].filter(Boolean).join("/") || "sem cidade"}
                    </span>
                    <span>Último: {formatData(entidade.ultimo_em)}</span>
                    {entidade.expira_em && <span>Expira: {formatData(entidade.expira_em)}</span>}
                  </div>
                </Linha>
              ))
            )}
          </ul>
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/5">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <Database className="size-6 text-white/60" aria-hidden />
            <h2 className="text-2xl font-semibold">Backups enviados</h2>
          </header>
          <ul
            ref={interativo ? undefined : enviados}
            className={`min-h-0 flex-1 space-y-2 p-3 ${interativo ? "overflow-y-auto" : "overflow-hidden"}`}
          >
            {visivel.enviados.length === 0 ? (
              <li className="text-xl p-4 text-center text-white/40">Nenhum backup no período</li>
            ) : (
              visivel.enviados.map((entidade) => (
                <li key={entidade.id} className="rounded-xl p-3" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xl text-white/50">{entidade.codigo ?? "—"}</span>
                    <span className="text-2xl min-w-0 flex-1 truncate font-medium">{entidade.nome}</span>
                    <span className="text-lg shrink-0 text-white/50">
                      {[entidade.cidade, entidade.uf].filter(Boolean).join("/")}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {entidade.backups.map((backup) => (
                      <Linha
                        key={backup.sistema}
                        className="border-t border-white/10 pt-1"
                        aoAbrir={abrir(entidade.id, entidade.nome, backup.sistema)}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                          <span className="text-xl w-40 shrink-0 font-semibold">{backup.sistema_nome}</span>
                          <span className="text-lg text-white/60">{formatDataHora(backup.enviado_em)}</span>
                          <span className="text-lg text-white/60">{backup.tamanho}</span>
                          <Sinal
                            ok={backup.corrompido === 0}
                            rotulo="Banco"
                            valor={ROTULO_DO_BANCO[backup.corrompido] ?? "Desconhecido"}
                          />
                          <Sinal
                            ok={backup.envio_ftp}
                            rotulo="FTP"
                            valor={backup.envio_ftp ? "Enviado" : "Não enviado"}
                          />
                          <Sinal
                            ok={!backup.erro_backup}
                            rotulo="Erro backup"
                            valor={backup.erro_backup ? "Com erro" : "Sem erro"}
                          />
                          <Sinal
                            ok={!backup.erro_restore}
                            rotulo="Erro restore"
                            valor={backup.erro_restore ? "Com erro" : "Sem erro"}
                          />
                        </div>
                      </Linha>
                    ))}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {celula && (
        <HistoricoDeBackups
          celula={celula}
          historico={historico}
          carregando={isLoading}
          erro={error}
          plugin={plugin}
          workspaceSlug={workspaceSlug}
          aoFechar={() => setCelula(null)}
        />
      )}
    </div>
  );
}
