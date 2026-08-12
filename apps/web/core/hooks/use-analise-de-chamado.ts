/**
 * A análise do chamado no momento de salvar — Parte 2 do contrato em
 * `.claude/CONTRATO_IA_REQUISITOS.md`.
 *
 * Diferente do texto fantasma, que pergunta sozinho enquanto se digita, esta
 * consulta é uma **ação**: nasce do clique em salvar. Por isso `useSWRMutation`
 * (`trigger`/`isMutating`/`reset`) em vez de `useSWR` — mesma biblioteca, o
 * lado dela que existe para mutação disparada por gente.
 *
 * Quem chama envolve o próprio salvar:
 *
 * ```ts
 * if (!(await liberarSalvamento())) return;   // o painel aparece; o clique seguinte salva
 * await salvarDeVerdade();
 * descartar();
 * ```
 *
 * Duas garantias que não se negociam:
 *
 * 1. **A IA nunca impede de trabalhar.** Falhou, demorou ou veio vazia →
 *    `liberarSalvamento()` devolve `true`, inclusive no modo `exigir`. Sem
 *    nota, não bloqueia.
 * 2. **Recurso desligado não custa nada.** Sem configuração ativa nenhuma
 *    requisição sai e nenhum pixel é reservado na tela.
 */
import { useCallback, useMemo } from "react";
import useSWRMutation from "swr/mutation";
// hooks
import { useConfiguracaoDeIa } from "@/hooks/use-configuracao-de-ia";
// services
import type {
  TAnaliseDeChamado,
  TCampoDeAnalise,
  TPedidoDeAnalise,
} from "@/services/analise-de-chamado.service";
import analiseDeChamadoService, { SEM_ANALISE, temAlgoADizer } from "@/services/analise-de-chamado.service";
import type { TModoDeAnalise } from "@/services/configuracao-de-ia.service";
import type { TContextoDeRequisito } from "@/services/sugestao-de-requisito.service";

export const ANALISE_DE_CHAMADO_KEY = (workspaceSlug: string, campo: TCampoDeAnalise, alvo: string) =>
  `ANALISE_DE_CHAMADO_${workspaceSlug}_${campo}_${alvo}`;

type TEstrategiaDeModo = {
  /** Espera a análise antes de decidir? O modo silencioso não espera ninguém. */
  aguarda: boolean;
  /** Com uma análise que tem algo a dizer, o salvamento segue mesmo assim? */
  liberaApos: (analise: TAnaliseDeChamado, minimo: number) => boolean;
  /** Com o painel já na tela, o clique seguinte salva? */
  insiste: boolean;
};

const ESTRATEGIA: Record<TModoDeAnalise, TEstrategiaDeModo> = {
  // Mostra o que achou e devolve o controle; quem quiser salvar assim mesmo
  // clica de novo.
  avisar: { aguarda: true, liberaApos: () => false, insiste: true },
  // Abaixo do mínimo o salvar fica bloqueado. Nota ausente não é nota baixa:
  // serviço fora do ar libera.
  exigir: {
    aguarda: true,
    liberaApos: (analise, minimo) => analise.aceitacao === null || analise.aceitacao >= minimo,
    insiste: false,
  },
  // Analisa e guarda, sem interromper — nem com espera, nem com painel.
  silencioso: { aguarda: false, liberaApos: () => true, insiste: true },
};

type TConteudo = {
  titulo?: string;
  descricao?: string;
  comentario?: string;
};

type TParametros = {
  workspaceSlug: string | undefined;
  campo: TCampoDeAnalise;
  /** Um dos dois: o projeto na abertura, o chamado no comentário. */
  projectId?: string | null;
  issueId?: string | null;
  entityId?: string | null;
  tipo?: string | null;
  /** O que será salvo, já em texto puro. */
  conteudo: TConteudo;
  contexto: TContextoDeRequisito;
};

const temConteudo = (conteudo: TConteudo): boolean =>
  [conteudo.titulo, conteudo.descricao, conteudo.comentario].some((texto) => (texto ?? "").trim().length > 0);

export const useAnaliseDeChamado = (params: TParametros) => {
  const { workspaceSlug, campo, projectId, issueId, entityId, tipo, conteudo, contexto } = params;
  const { configuracao } = useConfiguracaoDeIa(workspaceSlug);

  const alvo = projectId ?? issueId ?? "";
  const permitidoNoCampo = campo !== "comentario" || configuracao.analise_em_comentarios;
  const habilitada = Boolean(workspaceSlug) && Boolean(alvo) && configuracao.analise_ativa && permitidoNoCampo;

  const {
    data,
    error,
    isMutating,
    trigger,
    reset: descartar,
  } = useSWRMutation(
    habilitada && workspaceSlug ? ANALISE_DE_CHAMADO_KEY(workspaceSlug, campo, alvo) : null,
    (_chave: string, { arg }: { arg: TPedidoDeAnalise }) => analiseDeChamadoService.analisar(workspaceSlug ?? "", arg)
  );

  const montarPedido = useCallback(
    (): TPedidoDeAnalise => ({
      campo,
      project_id: projectId ?? undefined,
      issue_id: issueId ?? undefined,
      titulo: conteudo.titulo,
      descricao: conteudo.descricao,
      comentario: conteudo.comentario,
      tipo: tipo ?? undefined,
      entity_id: entityId ?? undefined,
      contexto,
    }),
    [campo, projectId, issueId, entityId, tipo, conteudo, contexto]
  );

  /** Nunca rejeita: a resposta neutra é uma resposta válida. */
  const pedir = useCallback(async (): Promise<TAnaliseDeChamado> => {
    try {
      return (await trigger(montarPedido())) ?? SEM_ANALISE;
    } catch {
      return SEM_ANALISE;
    }
  }, [trigger, montarPedido]);

  const analise = data ?? null;
  const estrategia = ESTRATEGIA[configuracao.modo];

  // O painel do modo silencioso não existe, mesmo com análise em mãos.
  const mostrarPainel = Boolean(
    habilitada && configuracao.modo !== "silencioso" && analise && temAlgoADizer(analise)
  );

  const bloqueado = Boolean(
    habilitada &&
      configuracao.modo === "exigir" &&
      analise &&
      analise.aceitacao !== null &&
      analise.aceitacao < configuracao.minimo_aceitacao
  );

  /** `true` = pode salvar agora. `false` = o painel está na tela; leia e decida. */
  const liberarSalvamento = useCallback(async (): Promise<boolean> => {
    if (!habilitada || !temConteudo(conteudo)) return true;
    if (!estrategia.aguarda) {
      void pedir();
      return true;
    }
    if (mostrarPainel && estrategia.insiste) return true;
    const resultado = await pedir();
    if (!temAlgoADizer(resultado)) return true;
    return estrategia.liberaApos(resultado, configuracao.minimo_aceitacao);
  }, [habilitada, conteudo, estrategia, mostrarPainel, pedir, configuracao.minimo_aceitacao]);

  return useMemo(
    () => ({
      analise,
      configuracao,
      /** Botão de salvar em carregando enquanto a IA responde. */
      analisando: isMutating,
      mostrarPainel,
      bloqueado,
      liberarSalvamento,
      reanalisar: pedir,
      descartar,
      error,
    }),
    [analise, configuracao, isMutating, mostrarPainel, bloqueado, liberarSalvamento, pedir, descartar, error]
  );
};
