/**
 * O `tipo` que o contrato da IA pede ("correcao" | "melhoria") sai das
 * ETIQUETAS do chamado, não do `type_id` — a taxonomia da empresa vive em
 * `labels`, com três nomes repetidos em todos os projetos.
 *
 * É esse campo que faz o modelo escolher o que cobrar: passo a passo e
 * reprodutibilidade numa correção, dor e escopo numa melhoria. Sem etiqueta
 * reconhecida ficamos sem `tipo`, e o modelo decide sozinho.
 */
import { useLabel } from "@/hooks/store/use-label";

/** "Projeto" é evolução: a aula só tem os templates de correção e melhoria. */
const TIPO_POR_ETIQUETA: Record<string, string> = {
  correcao: "correcao",
  melhoria: "melhoria",
  projeto: "melhoria",
};

/** Correção ganha de melhoria quando as duas etiquetas estão no chamado. */
const PRECEDENCIA = ["correcao", "melhoria"];

/** Aceita "Correção", "correcao" e "CORREÇÃO" como o mesmo nome. */
const normalizarNome = (nome: string): string =>
  nome
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export const useTipoDeRequisito = (labelIds: string[] | null | undefined): string | undefined => {
  const { getLabelById } = useLabel();

  if (!labelIds?.length) return undefined;

  // etiqueta apagada ou de outro projeto simplesmente não casa com nada
  const encontrados = new Set(
    labelIds.map((id) => TIPO_POR_ETIQUETA[normalizarNome(getLabelById(id)?.name ?? "")]).filter(Boolean)
  );

  return PRECEDENCIA.find((tipo) => encontrados.has(tipo));
};
