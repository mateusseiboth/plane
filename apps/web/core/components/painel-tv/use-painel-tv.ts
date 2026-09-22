/**
 * Ganchos dos painéis de TV: os dados (SWR + fluxo de eventos + recarga de
 * segurança), o relógio, a rotação das abas, a rolagem automática das listas
 * longas e o alerta sonoro de cliente parado.
 *
 * A TV fica ligada o dia inteiro e ninguém a recarrega: tudo aqui presume que
 * a página não será tocada por horas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { loadPainel, openStreamDoPainel, type ErroDoPainel } from "@/services/painel-tv.service";
import { proximaAba } from "./painel-helpers";
import { createAudioContext, playAlertaUrgente, readAlertasNovos } from "./alerta-sonoro";

/** Rede de segurança: se o fluxo de eventos cair, a tela ainda se atualiza. */
const RECARGA_DE_SEGURANCA_MS = 60_000;
/** O SAC repetia o alerta a cada 5 minutos enquanto houvesse cliente parado. */
const REPETICAO_DO_ALERTA_MS = 5 * 60_000;

type Consulta = Record<string, string | number | null | undefined>;

export function usePainelDados<T>(
  workspaceSlug: string,
  caminho: string,
  opcoes: { chave: string | null; params?: Consulta }
) {
  const params = opcoes.params ?? {};
  const chaveDoCache = ["PAINEL_TV", workspaceSlug, caminho, opcoes.chave ?? "sessao", JSON.stringify(params)];
  const { data, error, isLoading, isValidating, mutate } = useSWR<T, ErroDoPainel>(
    chaveDoCache,
    () => loadPainel<T>(workspaceSlug, caminho, { chave: opcoes.chave, params }),
    { revalidateOnFocus: false, keepPreviousData: true, refreshInterval: RECARGA_DE_SEGURANCA_MS }
  );

  const recarregar = useCallback(() => void mutate(), [mutate]);

  // O fluxo de eventos avisa "mudou alguma coisa"; a tela decide quando pedir.
  useEffect(() => {
    let agendado: ReturnType<typeof setTimeout> | null = null;
    const fechar = openStreamDoPainel(workspaceSlug, opcoes.chave, () => {
      if (agendado) return;
      agendado = setTimeout(() => {
        agendado = null;
        recarregar();
      }, 800);
    });
    return () => {
      if (agendado) clearTimeout(agendado);
      fechar();
    };
  }, [workspaceSlug, opcoes.chave, recarregar]);

  return { data, error, isLoading, isFetching: isValidating, refetch: recarregar };
}

/**
 * Quem é este painel: nome do espaço e por onde ele entrou (chave ou sessão).
 * Não muda enquanto a TV estiver ligada, então é lido uma vez.
 */
export function useEspacoDoPainel(workspaceSlug: string, chave: string | null) {
  const { data } = useSWR<{ workspace: { slug: string; name: string }; via: string; chave: string | null }>(
    ["PAINEL_TV_ME", workspaceSlug, chave ?? "sessao"],
    () => loadPainel(workspaceSlug, "/me/", { chave }),
    { revalidateOnFocus: false, revalidateIfStale: false }
  );
  return data ?? null;
}

/** Hora do relógio do cabeçalho, atualizada a cada 10 s. */
export function useRelogio(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 10_000);
    return () => clearInterval(relogio);
  }, []);
  return agora;
}

/** Quanto tempo faz que os dados chegaram, em segundos. */
export function useIdadeDosDados(geradoEm: string | undefined, agora: Date): number | null {
  return useMemo(() => {
    if (!geradoEm) return null;
    const instante = new Date(geradoEm).getTime();
    return Number.isNaN(instante) ? null : Math.max(0, Math.round((agora.getTime() - instante) / 1000));
  }, [geradoEm, agora]);
}

/**
 * Rotação automática das abas, com a barra de progresso da troca. `progresso`
 * vai de 0 a 1 dentro de cada volta.
 */
export function useRotacao(total: number, intervaloSeg: number) {
  const [indice, setIndice] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const [pausada, setPausada] = useState(false);

  useEffect(() => {
    if (pausada || total <= 1) return;
    const passoMs = 100;
    const passos = Math.max(1, (intervaloSeg * 1000) / passoMs);
    let contador = 0;
    const pulso = setInterval(() => {
      contador += 1;
      if (contador >= passos) {
        contador = 0;
        setIndice((atual) => proximaAba(atual, total));
      }
      setProgresso(contador / passos);
    }, passoMs);
    return () => clearInterval(pulso);
  }, [total, intervaloSeg, pausada]);

  // Lista que encolheu (aba some) não pode deixar o índice fora do intervalo.
  useEffect(() => {
    setIndice((atual) => (total > 0 && atual >= total ? 0 : atual));
  }, [total]);

  return {
    indice,
    progresso,
    pausada,
    alternarPausa: () => setPausada((p) => !p),
    escolher: (novo: number) => {
      setIndice(novo);
      setProgresso(0);
    },
  };
}

const VELOCIDADE_DA_ROLAGEM_PX = 1;
const PAUSA_NA_PONTA_MS = 2_500;

/**
 * Rolagem automática de lista longa: desce devagar até o fim, espera e volta ao
 * topo. Só roda quando o conteúdo não cabe — lista curta fica parada.
 */
export function useRolagemAutomatica<T extends HTMLElement>(dependencia: unknown) {
  const referencia = useRef<T | null>(null);

  useEffect(() => {
    const alvo = referencia.current;
    if (!alvo) return;
    let paradaAte = Date.now() + PAUSA_NA_PONTA_MS;
    let descendo = true;

    const passo = () => {
      if (!referencia.current) return;
      const elemento = referencia.current;
      const sobra = elemento.scrollHeight - elemento.clientHeight;
      if (sobra <= 8 || Date.now() < paradaAte) return;
      const limite = descendo ? sobra : 0;
      const proximo = elemento.scrollTop + (descendo ? VELOCIDADE_DA_ROLAGEM_PX : -VELOCIDADE_DA_ROLAGEM_PX);
      elemento.scrollTop = proximo;
      if ((descendo && proximo >= limite) || (!descendo && proximo <= limite)) {
        descendo = !descendo;
        paradaAte = Date.now() + PAUSA_NA_PONTA_MS;
      }
    };

    const pulso = setInterval(passo, 40);
    return () => clearInterval(pulso);
  }, [dependencia]);

  return referencia;
}

/** Som do alerta de urgente: toca no que é novo e repete enquanto houver algum. */
export function useAlertaSonoro(alertaIds: string[], comecarLigado: boolean) {
  const [somAtivo, setSomAtivo] = useState(false);
  const contexto = useRef<AudioContext | null>(null);
  const jaAvisados = useRef<Set<string>>(new Set());
  const chave = alertaIds.join(",");

  const tocar = useCallback(() => {
    if (contexto.current) playAlertaUrgente(contexto.current);
  }, []);

  const ativarSom = useCallback(() => {
    contexto.current ??= createAudioContext();
    void contexto.current?.resume();
    setSomAtivo(!!contexto.current);
    tocar();
  }, [tocar]);

  useEffect(() => {
    const atuais = chave ? chave.split(",") : [];
    const novos = readAlertasNovos(jaAvisados.current, atuais);
    jaAvisados.current = new Set(atuais);
    if (somAtivo && novos.length) tocar();
  }, [chave, somAtivo, tocar]);

  useEffect(() => {
    if (!somAtivo || !chave) return;
    const repeticao = setInterval(tocar, REPETICAO_DO_ALERTA_MS);
    return () => clearInterval(repeticao);
  }, [somAtivo, chave, tocar]);

  // `?som=1` na URL só vale como intenção: o navegador ainda exige um clique,
  // e o botão fica aceso esperando por ele.
  const querSom = comecarLigado && !somAtivo;

  return { somAtivo, querSom, ativarSom, desativarSom: () => setSomAtivo(false) };
}
