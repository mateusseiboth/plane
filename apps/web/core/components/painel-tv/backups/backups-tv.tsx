/**
 * Painel de TV dos backups, no formato do relatório da intranet: primeiro quem
 * está sem backup, depois os envios do período com os quatro sinalizadores
 * (banco, FTP, erro de backup e erro de restauração).
 *
 * Verde é "está bom", vermelho é "não está" — e cada um vem com a palavra ao
 * lado, porque a TV é olhada de longe e nem todo mundo separa as duas cores.
 */
import { Database } from "lucide-react";
import { FUNDO_DO_CARTAO, STATUS } from "../cores";
import { formatData, formatDataHora } from "../painel-helpers";
import { useRolagemAutomatica } from "../use-painel-tv";

export type TBackupEnviado = {
  sistema: number;
  sistema_nome: string;
  enviado_em: string;
  tamanho: string;
  corrompido: number;
  envio_ftp: boolean;
  erro_backup: boolean;
  erro_restore: boolean;
  ok: boolean;
};

export type TPainelDeBackups = {
  gerado_em: string;
  uf: string | null;
  ufs: string[];
  dias: number;
  sem_backup: {
    id: string;
    codigo: number | null;
    nome: string;
    cidade: string | null;
    uf: string | null;
    expira_em: string | null;
    ultimo_em: string | null;
    dias: number | null;
  }[];
  enviados: {
    id: string;
    codigo: number | null;
    nome: string;
    cidade: string | null;
    uf: string | null;
    expira_em: string | null;
    backups: TBackupEnviado[];
    com_problema: number;
  }[];
  contadores: {
    entidades_atrasadas: number;
    entidades_com_backup: number;
    backups_recebidos: number;
    maior_atraso_dias: number;
    com_problema: number;
  };
};

const ROTULO_DO_BANCO: Record<number, string> = {
  0: "Não corrompido",
  1: "Corrompido",
  2: "Não foi para o FTP",
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

export function BackupsDaTv({ painel }: { painel: TPainelDeBackups }) {
  const semBackup = useRolagemAutomatica<HTMLUListElement>(painel.sem_backup.length);
  const enviados = useRolagemAutomatica<HTMLUListElement>(painel.enviados.length);
  const semFonte = painel.contadores.entidades_com_backup === 0 && painel.contadores.entidades_atrasadas === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap gap-3">
        <Numero
          rotulo={`Sem backup há mais de ${painel.dias} dia(s)`}
          valor={painel.contadores.entidades_atrasadas}
          cor={painel.contadores.entidades_atrasadas > 0 ? STATUS.critico : undefined}
        />
        <Numero rotulo="Entidades que enviaram" valor={painel.contadores.entidades_com_backup} />
        <Numero rotulo="Backups recebidos" valor={painel.contadores.backups_recebidos} />
        <Numero
          rotulo="Com problema"
          valor={painel.contadores.com_problema}
          cor={painel.contadores.com_problema > 0 ? STATUS.critico : undefined}
        />
        <Numero rotulo="Maior atraso (dias)" valor={painel.contadores.maior_atraso_dias} />
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
            <span className="text-2xl font-bold tabular-nums">{painel.sem_backup.length}</span>
          </header>
          <ul ref={semBackup} className="min-h-0 flex-1 space-y-1 overflow-hidden p-2">
            {painel.sem_backup.length === 0 ? (
              <li className="text-xl p-4 text-center text-white/40">Ninguém atrasado</li>
            ) : (
              painel.sem_backup.map((entidade) => (
                <li key={entidade.id} className="rounded-lg px-3 py-2" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
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
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white/5">
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-2">
            <Database className="size-6 text-white/60" aria-hidden />
            <h2 className="text-2xl font-semibold">Backups enviados</h2>
          </header>
          <ul ref={enviados} className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
            {painel.enviados.length === 0 ? (
              <li className="text-xl p-4 text-center text-white/40">Nenhum backup no período</li>
            ) : (
              painel.enviados.map((entidade) => (
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
                      <li
                        key={backup.sistema}
                        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-white/10 pt-1"
                      >
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
                      </li>
                    ))}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
