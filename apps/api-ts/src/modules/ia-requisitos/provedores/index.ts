/**
 * Fábrica de provedores de IA.
 *
 * O modelo local é o provedor padrão, não o único: o Plane não fica casado com
 * ele. Trocar de provedor é mudar `IA_REQUISITOS_FORMATO`, não mexer em código.
 *
 * **Acrescentar um provedor é um arquivo novo e uma linha no mapa abaixo.**
 * Nenhum `if/else` escolhendo provedor: quem resolve é o mapa.
 */

import type {ConfigIaRequisitos} from "@modules/ia-requisitos/config";
import {criarProvedorAviao} from "@modules/ia-requisitos/provedores/aviao";
import {criarProvedorLlamacpp} from "@modules/ia-requisitos/provedores/llamacpp";
import {criarProvedorOllama} from "@modules/ia-requisitos/provedores/ollama";
import {criarProvedorOpenai} from "@modules/ia-requisitos/provedores/openai";
import type {ProvedorDeIa} from "@modules/ia-requisitos/tipos";

export type FabricaDeProvedor = (cfg: ConfigIaRequisitos) => ProvedorDeIa;

const PROVEDORES: Record<string, FabricaDeProvedor> = {
  aviao: criarProvedorAviao,
  openai: criarProvedorOpenai,
  llamacpp: criarProvedorLlamacpp,
  ollama: criarProvedorOllama,
};

export const FORMATOS_SUPORTADOS = Object.keys(PROVEDORES);

/** Um aviso por formato inválido: o log não pode virar uma linha por tecla digitada. */
const jaAvisados = new Set<string>();

function avisarUmaVez(formato: string) {
  if (jaAvisados.has(formato)) return;
  jaAvisados.add(formato);
  console.warn(
    `[ia-requisitos] IA_REQUISITOS_FORMATO="${formato}" não existe; ` +
      `o recurso fica desligado. Formatos: ${FORMATOS_SUPORTADOS.join(", ")}.`,
  );
}

/**
 * Devolve o provedor configurado, ou `null` quando o formato não existe.
 *
 * Formato desconhecido **não derruba o servidor**: cai no comportamento de
 * recurso desligado (200 com sugestão vazia) e registra o aviso — errar o nome
 * da variável não pode impedir ninguém de escrever chamado.
 */
export function criarProvedor(cfg: ConfigIaRequisitos): ProvedorDeIa | null {
  const fabrica = PROVEDORES[cfg.formato];
  if (!fabrica) {
    avisarUmaVez(cfg.formato);
    return null;
  }
  return fabrica(cfg);
}
