/**
 * Configuração da IA de levantamento de requisitos ("texto fantasma").
 *
 * A credencial NUNCA vai para o navegador: o frontend fala só com o Plane e o
 * segredo é lido aqui, pelo mesmo caminho dos demais segredos do processo
 * (variável de ambiente — ver `.claude/DEPLOY.md`).
 *
 * Sem `IA_REQUISITOS_URL` o recurso fica DESLIGADO. Esse é o estado de quem
 * sobe a aplicação sem configurar nada: a rota continua respondendo 200 com
 * sugestão vazia e ninguém percebe diferença ao escrever chamado.
 *
 * Endereço, formato do protocolo, credencial e modelo são configuração porque
 * o provedor é trocável (contrato, seção "Provedor de IA é trocável"): trocar
 * de provedor é mudar variável de ambiente, não mexer em código.
 *
 * A leitura acontece a cada chamada, e não uma vez no carregamento do módulo,
 * porque ligar/desligar e trocar de provedor precisam valer sem rebuild — e é
 * o que permite aos testes trocarem a configuração sem subir outro processo.
 */

export type ConfigIaRequisitos = {
  ligada: boolean;
  /** Endereço base do serviço, sem barra final. Cada provedor compõe o caminho. */
  urlBase: string;
  /** Nome do formato do protocolo (`aviao`, `openai`, `llamacpp`, `ollama`). */
  formato: string;
  chave: string;
  /** Nome do modelo, para os formatos que pedem. */
  modelo: string;
  tempoLimiteMs: number;
  /** Endpoint de extração de texto de imagem (`POST …/ocr`). */
  urlOcr: string;
  tempoLimiteMelhoriaMs: number;
  tempoLimiteOcrMs: number;
  /** Host do serviço, para a trilha de auditoria (sem credencial, sem caminho). */
  destino: string;
};

/** Teto de latência fixado no contrato: passou disso, o frontend descarta. */
// O contrato falava em 2 s, mas a medição no modelo local desmentiu: descrição
// leva ~2,2 s e chega a 2,7 s. Com 2 s a sugestão mais valiosa nunca chegava.
const TEMPO_LIMITE_PADRAO_MS = 5000;
/** O OCR divide o mesmo orçamento, então tem um teto menor que o da sugestão. */
const TEMPO_LIMITE_OCR_PADRAO_MS = 1500;
/**
 * Melhorar é outra natureza de espera. A sugestão aparece sozinha e some sem
 * ninguém pedir — 5 s ali já é demais. Aqui a pessoa CLICOU e está olhando o
 * girador, e o modelo escreve o template inteiro: medido em ~3,7 s, passando
 * de 5 s em texto grande. Com o teto da sugestão o botão dava 502 justamente
 * nos textos que mais precisavam de ajuda.
 */
const TEMPO_LIMITE_MELHORIA_PADRAO_MS = 30000;
/** O modelo local é o provedor padrão — não o único. */
const FORMATO_PADRAO = "aviao";

function texto(valor: string | undefined): string {
  return (valor ?? "").trim();
}

function semBarraFinal(url: string): string {
  return url.replace(/\/+$/, "");
}

function inteiroPositivo(valor: string | undefined, padrao: number): number {
  const n = Number(texto(valor));
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : padrao;
}

/** `undefined`/vazio devolve o padrão; qualquer outra coisa é lida como booleano. */
function booleano(valor: string | undefined, padrao: boolean): boolean {
  const v = texto(valor).toLowerCase();
  if (!v) return padrao;
  return !["false", "0", "no", "nao", "não", "off"].includes(v);
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function configIaRequisitos(): ConfigIaRequisitos {
  const urlBase = semBarraFinal(texto(process.env.IA_REQUISITOS_URL));

  return {
    // Sem endereço não há para onde ligar. O interruptor explícito desliga
    // mesmo com tudo configurado (janela de manutenção do worker, por exemplo).
    ligada: Boolean(urlBase) && booleano(process.env.IA_REQUISITOS_ENABLED, true),
    urlBase,
    formato: texto(process.env.IA_REQUISITOS_FORMATO).toLowerCase() || FORMATO_PADRAO,
    chave: texto(process.env.IA_REQUISITOS_CHAVE),
    modelo: texto(process.env.IA_REQUISITOS_MODELO),
    tempoLimiteMs: inteiroPositivo(process.env.IA_REQUISITOS_TIMEOUT_MS, TEMPO_LIMITE_PADRAO_MS),
    tempoLimiteMelhoriaMs: inteiroPositivo(
      process.env.IA_REQUISITOS_MELHORIA_TIMEOUT_MS,
      TEMPO_LIMITE_MELHORIA_PADRAO_MS
    ),
    urlOcr: semBarraFinal(texto(process.env.IA_REQUISITOS_OCR_URL)) || (urlBase ? `${urlBase}/ocr` : ""),
    tempoLimiteOcrMs: inteiroPositivo(process.env.IA_REQUISITOS_OCR_TIMEOUT_MS, TEMPO_LIMITE_OCR_PADRAO_MS),
    destino: hostDe(urlBase),
  };
}
