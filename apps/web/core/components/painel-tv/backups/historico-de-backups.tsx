/**
 * Gaveta lateral com o histórico de uma célula entidade × sistema: cada envio
 * com data e hora, tamanho, nome do arquivo, de onde veio e os quatro
 * sinalizadores do relatório legado.
 *
 * É o detalhe que a infra abre para conferir os backups recebidos, por isso o
 * envio QUEBRADO também aparece, marcado: esconder o que deu errado seria
 * esconder justamente o que se veio ver.
 */
import { HardDrive, ShieldAlert, X } from "lucide-react";
import { FUNDO_DO_CARTAO, FUNDO_DO_PAINEL, STATUS } from "../cores";
import { formatDataHora } from "../painel-helpers";
import { SISTEMAS_DO_BACKUP, type TEnvioDoHistorico, type THistoricoDeBackups } from "./backups-helpers";
import type { CelulaDoBackup } from "./use-backups";

type Props = {
  celula: CelulaDoBackup;
  historico: THistoricoDeBackups | undefined;
  carregando: boolean;
  erro?: { detail: string };
  plugin: { slug: string; name: string } | null;
  workspaceSlug: string;
  aoFechar: () => void;
};

const nomeDoSistema = (codigo: number | null): string =>
  codigo === null
    ? "todos os sistemas"
    : (SISTEMAS_DO_BACKUP.find((s) => s.codigo === codigo)?.nome ?? `Sistema ${codigo}`);

const ROTULO_DO_BANCO: Record<number, string> = {
  0: "Não corrompido",
  1: "Corrompido",
  2: "Não foi para o FTP",
};

function Sinal({ ok, rotulo, valor }: { ok: boolean; rotulo: string; valor: string }) {
  return (
    <span className="text-sm whitespace-nowrap">
      <span className="text-white/50">{rotulo} </span>
      <span className="font-semibold" style={{ color: ok ? STATUS.bom : STATUS.critico }}>
        {valor}
      </span>
    </span>
  );
}

function Envio({ envio }: { envio: TEnvioDoHistorico }) {
  return (
    <li className="rounded-xl p-3" style={{ backgroundColor: FUNDO_DO_CARTAO }}>
      <div className="flex items-baseline gap-3">
        <span className="text-lg font-semibold">{formatDataHora(envio.enviado_em)}</span>
        <span className="text-base text-white/60">{envio.sistema_nome}</span>
        <span className="text-base ml-auto text-white/60">{envio.tamanho}</span>
        <span className="text-sm font-semibold" style={{ color: envio.ok ? STATUS.bom : STATUS.critico }}>
          {envio.ok ? "Em ordem" : "Com problema"}
        </span>
      </div>

      {envio.arquivo && <p className="text-sm font-mono mt-1 truncate text-white/70">{envio.arquivo}</p>}

      <div className="text-sm mt-1 flex flex-wrap gap-x-5 gap-y-1 text-white/50">
        {envio.origem && <span>Origem: {envio.origem}</span>}
        {envio.ip_externo && <span>IP externo: {envio.ip_externo}</span>}
        {envio.versao && <span>Versão do backup: {envio.versao}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/10 pt-2">
        <Sinal ok={envio.corrompido === 0} rotulo="Banco" valor={ROTULO_DO_BANCO[envio.corrompido] ?? "Desconhecido"} />
        <Sinal ok={envio.envio_ftp} rotulo="FTP" valor={envio.envio_ftp ? "Enviado" : "Não enviado"} />
        <Sinal ok={!envio.erro_backup} rotulo="Erro backup" valor={envio.erro_backup ? "Com erro" : "Sem erro"} />
        <Sinal ok={!envio.erro_restore} rotulo="Erro restore" valor={envio.erro_restore ? "Com erro" : "Sem erro"} />
      </div>
    </li>
  );
}

export function HistoricoDeBackups({ celula, historico, carregando, erro, plugin, workspaceSlug, aoFechar }: Props) {
  const entidade = historico?.entidade;
  const envios = historico?.envios ?? [];

  return (
    <aside
      className="shadow-2xl fixed inset-y-0 right-0 z-[90] flex w-[46rem] max-w-full flex-col border-l border-white/10 text-white"
      style={{ backgroundColor: FUNDO_DO_PAINEL }}
      aria-label="Histórico de backups"
    >
      <header className="flex shrink-0 items-start gap-4 border-b border-white/10 px-6 py-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl truncate font-semibold">{entidade?.nome ?? celula.entidade}</h2>
          <p className="text-base mt-1 text-white/60">
            {nomeDoSistema(celula.sistema)}
            {entidade?.cidade ? ` · ${[entidade.cidade, entidade.uf].filter(Boolean).join("/")}` : ""}
            {historico ? ` · últimos ${historico.dias} dias` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-lg border border-white/20 px-2 py-2 text-white/70 transition hover:text-white"
          title="Fechar"
        >
          <X className="size-5" />
        </button>
      </header>

      {plugin && (
        <div className="shrink-0 border-b border-white/10 px-6 py-3">
          <a
            href={`/${workspaceSlug}/plugins/${plugin.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-base inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-white/80 transition hover:text-white"
          >
            <ShieldAlert className="size-5" aria-hidden />
            Solicitar backup em {plugin.name}
          </a>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {carregando && <p className="text-lg text-white/50">Carregando o histórico…</p>}
        {erro && (
          <p className="text-lg" style={{ color: STATUS.critico }}>
            {erro.detail}
          </p>
        )}
        {!carregando && !erro && envios.length === 0 && (
          <div className="text-lg flex flex-col items-center gap-2 py-10 text-white/50">
            <HardDrive className="size-10" aria-hidden />
            <p>Nenhum envio no período.</p>
          </div>
        )}
        <ul className="space-y-2">
          {envios.map((envio) => (
            <Envio key={envio.id} envio={envio} />
          ))}
        </ul>
      </div>
    </aside>
  );
}
