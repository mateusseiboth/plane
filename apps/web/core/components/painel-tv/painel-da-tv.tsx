/**
 * A página de um painel de TV: lê as opções da URL, carrega os dados (chave de
 * painel ou sessão), monta a moldura e entrega o conteúdo ao painel escolhido.
 *
 * Painel novo é UMA entrada no mapa `PAINEIS` — nada de `if` por painel.
 */
import { useMemo } from "react";
import { ItemDaLegenda, CarregandoPainel, ErroDoPainel, MolduraDoPainel } from "./moldura";
import { COR_DA_FAIXA, COR_DO_ATENDENTE, ROTULO_DA_FAIXA, ROTULO_DO_ATENDENTE, STATUS } from "./cores";
import { readOpcoesDaUrl, readTituloDoPainel, type PainelDaTv } from "./painel-helpers";
import {
  useAlertaSonoro,
  useEspacoDoPainel,
  useIdadeDosDados,
  usePainelDados,
  useRelogio,
  useRotacao,
} from "./use-painel-tv";
import { QuadroDaTv, type TQuadroDaTv } from "./quadro/quadro-tv";
import { AtendimentoDaTv, type TPainelDeAtendimento } from "./atendimento/atendimento-tv";
import { MapaDaTv, type TPainelDoMapa } from "./mapa/mapa-tv";
import { BackupsDaTv, type TPainelDeBackups } from "./backups/backups-tv";
import { useFiltrosDeBackup } from "./backups/use-backups";

type Props = { workspaceSlug: string; painel: PainelDaTv; busca: string };

/** Caminho da rota de dados e parâmetros de cada painel. */
const PAINEIS: Record<PainelDaTv, { caminho: string }> = {
  ti: { caminho: "/quadro/ti/" },
  qualidade: { caminho: "/quadro/qualidade/" },
  atendimento: { caminho: "/atendimento/" },
  mapa: { caminho: "/mapa/" },
  backups: { caminho: "/backups/" },
};

const LEGENDA_DO_QUADRO = (
  <>
    <ItemDaLegenda cor={STATUS.critico}>Cliente parado (urgente)</ItemDaLegenda>
    <ItemDaLegenda cor={STATUS.serio}>Prioridade alta</ItemDaLegenda>
    <ItemDaLegenda cor={STATUS.atencao}>Prioridade média</ItemDaLegenda>
    <span>O número grande é o do chamado no ano.</span>
  </>
);

export function PainelDaTvPage({ workspaceSlug, painel, busca }: Props) {
  const opcoes = useMemo(() => readOpcoesDaUrl(busca), [busca]);
  const agora = useRelogio();
  const espaco = useEspacoDoPainel(workspaceSlug, opcoes.chave);

  // O painel de backups é o único que a pessoa OPERA: quem está logado (ou
  // abriu com `?interativo=1`) ganha a barra de filtros e o detalhe por clique.
  const logado = espaco?.via === "sessao";
  const interativo = painel === "backups" && (opcoes.interativo || logado);
  const backups = useFiltrosDeBackup(opcoes.dias);

  const params = useMemo(
    () => (painel === "backups" ? { uf: opcoes.uf, dias: backups.dias } : {}),
    [painel, opcoes.uf, backups.dias]
  );
  const { data, error, isLoading } = usePainelDados<Record<string, any>>(workspaceSlug, PAINEIS[painel].caminho, {
    chave: opcoes.chave,
    params,
  });

  const urgentes = useMemo(() => {
    const doQuadro = (data?.urgentes ?? []) as { id: string }[];
    return doQuadro.map((c) => c.id);
  }, [data]);
  const som = useAlertaSonoro(urgentes, opcoes.somLigado);

  const abas = (data?.abas ?? []) as unknown[];
  const rotacao = useRotacao(painel === "atendimento" ? abas.length : 0, opcoes.intervaloSeg);

  const idade = useIdadeDosDados(data?.gerado_em as string | undefined, agora);

  if (error) {
    return (
      <ErroDoPainel
        mensagem={error.status === 401 || error.status === 403 ? "Painel sem acesso" : "Painel indisponível"}
        detalhe={error.detail}
      />
    );
  }
  if (isLoading && !data) return <CarregandoPainel />;
  if (!data) return <ErroDoPainel mensagem="Painel sem dados" />;

  const conteudo: Record<PainelDaTv, () => JSX.Element> = {
    ti: () => <QuadroDaTv quadro={data as unknown as TQuadroDaTv} />,
    qualidade: () => <QuadroDaTv quadro={data as unknown as TQuadroDaTv} />,
    atendimento: () => (
      <AtendimentoDaTv
        painel={data as unknown as TPainelDeAtendimento}
        indice={rotacao.indice}
        progresso={rotacao.progresso}
        aoEscolher={rotacao.escolher}
      />
    ),
    mapa: () => <MapaDaTv painel={data as unknown as TPainelDoMapa} />,
    backups: () => (
      <BackupsDaTv
        painel={data as unknown as TPainelDeBackups}
        workspaceSlug={workspaceSlug}
        chave={opcoes.chave}
        interativo={interativo}
        logado={!!logado}
        filtros={backups.filtros}
        dias={backups.dias ?? ((data as unknown as TPainelDeBackups).dias || 1)}
        aoFiltrar={backups.aplicar}
        aoTrocarDias={backups.trocarDias}
      />
    ),
  };

  const legendas: Record<PainelDaTv, JSX.Element | undefined> = {
    ti: LEGENDA_DO_QUADRO,
    qualidade: LEGENDA_DO_QUADRO,
    atendimento: (
      <>
        <ItemDaLegenda cor={COR_DO_ATENDENTE.online!}>{ROTULO_DO_ATENDENTE.online}</ItemDaLegenda>
        <ItemDaLegenda cor={COR_DO_ATENDENTE.invisivel!}>{ROTULO_DO_ATENDENTE.invisivel}</ItemDaLegenda>
        <ItemDaLegenda cor={COR_DO_ATENDENTE.offline!}>{ROTULO_DO_ATENDENTE.offline}</ItemDaLegenda>
        <span>As abas trocam sozinhas a cada {opcoes.intervaloSeg}s.</span>
      </>
    ),
    mapa: (
      <>
        <ItemDaLegenda cor={COR_DA_FAIXA.baixo}>{ROTULO_DA_FAIXA.baixo}</ItemDaLegenda>
        <ItemDaLegenda cor={COR_DA_FAIXA.medio}>{ROTULO_DA_FAIXA.medio}</ItemDaLegenda>
        <ItemDaLegenda cor={COR_DA_FAIXA.alto}>{ROTULO_DA_FAIXA.alto}</ItemDaLegenda>
        <ItemDaLegenda cor={STATUS.critico}>Servidor offline</ItemDaLegenda>
        <ItemDaLegenda cor={STATUS.atencao}>B: backup atrasado</ItemDaLegenda>
      </>
    ),
    backups: (
      <>
        <ItemDaLegenda cor={STATUS.bom}>Backup em ordem</ItemDaLegenda>
        <ItemDaLegenda cor={STATUS.critico}>Corrompido, não enviado ou com erro</ItemDaLegenda>
        <span>Janela de {(data as unknown as TPainelDeBackups).dias ?? 1} dia(s).</span>
        {interativo && <span>Clique numa entidade para ver o histórico dos envios.</span>}
      </>
    ),
  };

  const totalDoQuadro = typeof data.total === "number" ? data.total : null;
  const totaisDoAtendimento = data.totais as
    | { abertas: number; encerradas_hoje: number; atendentes_online: number }
    | undefined;

  const acoes =
    totalDoQuadro !== null ? (
      <span className="text-2xl text-white/70">
        Total <strong className="text-3xl text-white">{totalDoQuadro}</strong>
      </span>
    ) : totaisDoAtendimento ? (
      <span className="text-2xl text-white/70">
        Em aberto <strong className="text-3xl text-white">{totaisDoAtendimento.abertas}</strong>
        <span className="ml-6">
          Encerradas hoje <strong className="text-3xl text-white">{totaisDoAtendimento.encerradas_hoje}</strong>
        </span>
        <span className="ml-6">
          Atendentes online <strong className="text-3xl text-white">{totaisDoAtendimento.atendentes_online}</strong>
        </span>
      </span>
    ) : undefined;

  return (
    <MolduraDoPainel
      titulo={readTituloDoPainel(painel)}
      espaco={espaco?.workspace.name ?? workspaceSlug}
      agora={agora}
      idadeDosDados={idade}
      aoVivo={!error}
      som={
        painel === "ti" || painel === "qualidade"
          ? { ativo: som.somAtivo, querSom: som.querSom, ativar: som.ativarSom, desativar: som.desativarSom }
          : undefined
      }
      acoes={acoes}
      legenda={legendas[painel]}
      compacta={painel === "mapa"}
    >
      {conteudo[painel]()}
    </MolduraDoPainel>
  );
}
