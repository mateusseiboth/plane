import { sanitizeHTML } from "@plane/utils";

/**
 * O texto do editor como a IA precisa recebê-lo: uma linha por bloco.
 *
 * `sanitizeHTML` remove as tags e não põe nada no lugar, então
 * `<p>ofício</p><p>Situação atual</p>` chega do outro lado como
 * `"ofícioSituação atual"` — uma palavra só. O checklist da IA procura
 * conceitos por fronteira de palavra, e ali não existe mais fronteira: medido
 * no chamado das Sanções, a nota caiu de 86 para 56 e a tela cobrou do autor
 * "Falta a situação atual" num texto cuja segunda linha é "Situação atual".
 * Os cinco critérios em DADO/QUANDO/ENTÃO viravam uma linha só pelo mesmo
 * motivo.
 *
 * A quebra vai onde o bloco terminava — parágrafo, item de lista, título,
 * linha de tabela, `<br>` — antes de as tags serem removidas. Nada do texto do
 * autor é alterado: só se acrescenta a quebra que o HTML já dizia existir.
 */
const FIM_DE_BLOCO = /<\/(p|div|li|h[1-6]|tr|blockquote|pre)>|<br\s*\/?>/gi;

export const textoDoEditor = (html: string | null | undefined): string =>
  sanitizeHTML((html ?? "").replace(FIM_DE_BLOCO, "$&\n"))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
