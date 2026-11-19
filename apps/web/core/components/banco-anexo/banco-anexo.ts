/**
 * Banco anexado no texto (testes da nova intranet 3, 19/11/2026), sem React:
 * o que o bloco grava, o que ele mostra e a espera da preparação. O link do
 * servidor de backups expira a cada hora; o bloco guarda só QUAL backup é, e o
 * link nasce a cada clique (`POST .../bancos/:envio/preparar/`).
 */
import type { TBancoAnexoAttrs } from "@plane/editor";

export type TArquivoDeBanco = { id: string; file_name: string | null; received_at: string | null };

export type TPreparacao = { id: string; estado: string; url: string | null; mensagem: string | null };

export const buildAttrsDoBanco = (
  arquivo: TArquivoDeBanco,
  contexto: { entidade: string | null; sistema: string | null }
): TBancoAnexoAttrs => ({
  envio: arquivo.id,
  nome: arquivo.file_name,
  entidade: contexto.entidade,
  sistema: contexto.sistema,
  recebidoEm: arquivo.received_at,
});

const formatDia = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Campo_Grande" }).format(new Date(iso)) : null;

export const readRotuloDoBanco = (attrs: TBancoAnexoAttrs): string => {
  const partes = [attrs.nome, attrs.entidade, attrs.sistema, formatDia(attrs.recebidoEm)].filter(Boolean);
  return partes.length ? partes.join(" · ") : `Banco ${attrs.envio ?? ""}`.trim();
};

const INTERVALO_MS = 2000;
/** Um banco grande leva minutos para ser copiado no servidor; depois disso desiste. */
const LIMITE_DE_PERGUNTAS = 450;
const MENSAGEM_DEMOROU = "O servidor de backups demorou demais. Tente de novo em instantes.";
const MENSAGEM_ERRO = "Não foi possível preparar o banco.";

type TEstrategiaDaPreparacao = (p: TPreparacao) => { url: string } | { erro: string } | null;

/** O que fazer com cada estado; estado desconhecido segue esperando. */
const POR_ESTADO: Record<string, TEstrategiaDaPreparacao> = {
  pronto: (p) => (p.url ? { url: p.url } : { erro: MENSAGEM_ERRO }),
  erro: (p) => ({ erro: p.mensagem ?? MENSAGEM_ERRO }),
};

const espera = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Pergunta pela preparação até ficar pronta e devolve a URL do arquivo. */
export async function waitPreparacao(
  inicial: TPreparacao,
  ler: (id: string) => Promise<TPreparacao>,
  aguardar: (ms: number) => Promise<void> = espera
): Promise<string> {
  let atual = inicial;
  for (let pergunta = 0; pergunta <= LIMITE_DE_PERGUNTAS; pergunta++) {
    const desfecho = POR_ESTADO[atual.estado]?.(atual) ?? null;
    if (desfecho && "url" in desfecho) return desfecho.url;
    if (desfecho) throw new Error(desfecho.erro);
    // oxlint-disable-next-line no-await-in-loop -- uma pergunta por vez, de propósito.
    await aguardar(INTERVALO_MS);
    // oxlint-disable-next-line no-await-in-loop -- idem.
    atual = await ler(atual.id);
  }
  throw new Error(MENSAGEM_DEMOROU);
}
