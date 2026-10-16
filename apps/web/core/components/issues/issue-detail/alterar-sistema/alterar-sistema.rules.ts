/**
 * Regras de tela do "Alterar sistema" do chamado.
 *
 * Quem pode alterar o sistema vem da matriz de ações (`issue.change_system`),
 * consultada no componente com `canInProject`: a tela não decide por nível.
 * O servidor faz o resto (cancela o antigo, abre o novo e relaciona os dois).
 */
import { sortBy } from "lodash-es";
import type { TChamadoMovido } from "@plane/types";

type Sentido = "para" | "de";

const PREFIXO_DA_DICA: Record<Sentido, string> = {
  para: "Movido para",
  de: "Veio de",
};

const buildIdentificador = (chamado: TChamadoMovido) => `${chamado.project_identifier}-${chamado.sequence_id}`;

export const buildLinkDoChamadoMovido = (workspaceSlug: string, chamado: TChamadoMovido) =>
  `/${workspaceSlug}/browse/${buildIdentificador(chamado)}/`;

export const buildDicaDoChamadoMovido = (sentido: Sentido, chamado: TChamadoMovido) =>
  `${PREFIXO_DA_DICA[sentido]} ${buildIdentificador(chamado)}`;

type Sistema = { id: string; name: string };

export const listSistemasDeDestino = <T extends Sistema>(sistemas: (T | undefined)[], atualId: string): T[] =>
  sortBy(
    sistemas.filter((s): s is T => !!s && s.id !== atualId),
    (s) => s.name.toLocaleLowerCase("pt-BR")
  );
