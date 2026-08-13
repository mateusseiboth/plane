/**
 * A prioridade do chamado (`Issue.priority`), em português.
 *
 * O banco guarda a chave em inglês e quem lê mostra o rótulo — os relatórios, os
 * gráficos de Análises e o contexto que vai para a IA. Cada um desses lugares
 * tinha a sua própria tradução da mesma coluna, e traduções paralelas da mesma
 * coisa acabam divergindo; a lista mora aqui.
 */

/** As prioridades de `Issue.priority`, na ordem em que a interface as lista. */
export const PRIORIDADES = ["urgent", "high", "medium", "low", "none"] as const;

export type Prioridade = (typeof PRIORIDADES)[number];

/**
 * O rótulo como o seletor da modal o mostra (é a tradução de `packages/i18n`,
 * pt-BR). "Nenhum" é o nome que a ausência tem NO SELETOR; numa legenda de
 * gráfico ela fica melhor como "Sem prioridade", e é por isso que os relatórios
 * sobrescrevem só esse item.
 */
export const ROTULO_DE_PRIORIDADE: Record<Prioridade, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
  none: "Nenhum",
};

function semAcento(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** A chave do banco e o rótulo já traduzido levam ao mesmo lugar. */
const POR_TEXTO = new Map<string, string>(
  PRIORIDADES.flatMap((chave): [string, string][] => [
    [chave, ROTULO_DE_PRIORIDADE[chave]],
    [semAcento(ROTULO_DE_PRIORIDADE[chave]), ROTULO_DE_PRIORIDADE[chave]],
  ]),
);

/**
 * O rótulo de uma prioridade, ou `null` quando o valor não é uma delas.
 *
 * Aceita as duas grafias porque o valor tanto pode vir do banco (`"urgent"`)
 * quanto de uma tela que já traduziu (`"Urgente"`). Texto solto não vira
 * prioridade: o que não estiver na lista sai como ausente.
 */
export function rotuloDePrioridade(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  return POR_TEXTO.get(semAcento(valor)) ?? null;
}
