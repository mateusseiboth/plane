/**
 * Extração de texto das imagens anexadas ao chamado.
 *
 * O chamado tem prints, e é neles que costuma estar o texto do erro; o modelo
 * é de texto. Quem extrai é o worker do modelo, em `POST /ocr`.
 *
 * O endpoint pode ainda não existir no serviço: o caminho fica pronto e degrada
 * calado (string vazia), então o anexo entra no contexto só com o nome — que já
 * é informação.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";

/** Campos aceitos como texto extraído, em ordem de preferência. */
const CAMPOS_DE_TEXTO = ["texto_extraido", "texto", "text"] as const;

export async function extrairTextoDeImagem(
  cfg: ConfigIaRequisitos,
  arquivo: {nome: string; tipo: string; conteudo: Blob},
): Promise<string> {
  if (!cfg.urlOcr) return "";
  try {
    const form = new FormData();
    form.append("arquivo", arquivo.conteudo, arquivo.nome);
    const res = await fetch(cfg.urlOcr, {
      method: "POST",
      headers: {"X-API-Key": cfg.chave},
      body: form,
      signal: AbortSignal.timeout(cfg.tempoLimiteOcrMs),
    });
    if (!res.ok) return "";
    const corpo = (await res.json()) as Record<string, unknown>;
    const campo = CAMPOS_DE_TEXTO.find((c) => typeof corpo?.[c] === "string");
    return campo ? String(corpo[campo]) : "";
  } catch (e: any) {
    console.warn(`[ia-requisitos] OCR indisponível para "${arquivo.nome}":`, e?.message ?? e);
    return "";
  }
}
