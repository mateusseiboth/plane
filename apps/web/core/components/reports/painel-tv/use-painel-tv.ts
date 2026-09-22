/**
 * Dados do painel de TV: recarrega pelo SSE a cada mudança de chamado ou de
 * solicitação e, como rede de segurança (conexão caída, proxy que corta o
 * stream), a cada minuto.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtimeRefetch, type RealtimeEvent } from "@/hooks/use-realtime";
import { useReport } from "@/hooks/use-report";
import { createAudioContext, playAlertaUrgente, readAlertasNovos } from "./alerta-sonoro";

const RECARGA_DE_SEGURANCA_MS = 60_000;
/** O SAC repetia o alerta a cada 5 minutos enquanto houvesse cliente parado. */
const REPETICAO_DO_ALERTA_MS = 5 * 60_000;

const isMudancaDeChamado = (e: RealtimeEvent) => e.entity === "issue" || e.entity === "intake";

export function usePainelTv(workspaceSlug: string | undefined, setor: string, projectIds: string[]) {
  const params = { setor, ...(projectIds.length ? { project_ids: projectIds.join(",") } : {}) };
  const relatorio = useReport(workspaceSlug, "tv-panel", params, { refreshInterval: RECARGA_DE_SEGURANCA_MS });
  useRealtimeRefetch(isMudancaDeChamado, () => void relatorio.refetch(), 800);
  return relatorio;
}

/** Som do alerta de urgente: toca quando aparece um novo e repete enquanto houver algum. */
export function useAlertaSonoro(alertaIds: string[]) {
  const [somAtivo, setSomAtivo] = useState(false);
  const contexto = useRef<AudioContext | null>(null);
  const jaAvisados = useRef<Set<string>>(new Set());
  const chave = alertaIds.join(",");

  const tocar = useCallback(() => {
    if (contexto.current) playAlertaUrgente(contexto.current);
  }, []);

  useEffect(() => {
    const atuais = chave ? chave.split(",") : [];
    const novos = readAlertasNovos(jaAvisados.current, atuais);
    // Quem saiu da lista pode tocar de novo se voltar.
    jaAvisados.current = new Set(atuais);
    if (somAtivo && novos.length) tocar();
  }, [chave, somAtivo, tocar]);

  useEffect(() => {
    if (!somAtivo || !chave) return;
    const repeticao = setInterval(tocar, REPETICAO_DO_ALERTA_MS);
    return () => clearInterval(repeticao);
  }, [somAtivo, chave, tocar]);

  const ativarSom = () => {
    contexto.current ??= createAudioContext();
    void contexto.current?.resume();
    setSomAtivo(!!contexto.current);
    tocar();
  };

  return { somAtivo, ativarSom, desativarSom: () => setSomAtivo(false) };
}

/** Hora cheia do relógio do painel, atualizada a cada 30 s. */
export function useRelogio() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(relogio);
  }, []);
  return agora;
}
