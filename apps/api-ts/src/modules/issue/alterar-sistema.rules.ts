/**
 * "Alterar sistema" do chamado: regras puras, sem banco. O banco fica em
 * `alterar-sistema.dao.ts` e a orquestração em `alterar-sistema.service.ts`.
 *
 * O chamado não troca de sistema no lugar: o antigo vai para a etapa de
 * cancelados do sistema atual e um novo nasce no destino com tudo o que o
 * antigo tinha. Etapas e etiquetas são do sistema, então o novo recebe as do
 * destino casadas por nome (e, na etapa, por grupo).
 */
import { DomainError } from "@utils/erro-de-dominio";
import { createFieldError } from "@utils/field-error";

export const MENSAGENS_DE_ALTERAR_SISTEMA = {
  destinoObrigatorio: "Escolha o sistema de destino.",
  mesmoSistema: "Escolha um sistema diferente do atual.",
  semCancelados: "O sistema atual não tem etapa de cancelados. Crie uma nas etapas do sistema.",
  jaMovido: "Este chamado já foi movido para outro sistema.",
  naoEncontrado: "Chamado não encontrado.",
} as const;

export const CAMPO_DO_DESTINO = "project_id_destino";

/** O tipo de relação que o produto já usa para "relaciona-se a". */
export const RELACAO_DO_CHAMADO_MOVIDO = "relates_to";

export type EtapaDoSistema = { id: string; name: string; group: string; default: boolean; sequence: number };

type EtapaAtual = Pick<EtapaDoSistema, "name" | "group"> | null | undefined;

const normalizeNome = (nome: string) => nome.trim().toLocaleLowerCase("pt-BR");

const sortBySequence = (etapas: EtapaDoSistema[]) => etapas.toSorted((a, b) => a.sequence - b.sequence);

type CriterioDeEtapa = (etapas: EtapaDoSistema[], atual: EtapaAtual) => EtapaDoSistema | undefined;

/** Em ordem: mesmo nome, mesmo grupo, a padrão do destino, a primeira pela ordem. */
const CRITERIOS_DA_ETAPA_INICIAL: CriterioDeEtapa[] = [
  (etapas, atual) => (atual ? etapas.find((e) => normalizeNome(e.name) === normalizeNome(atual.name)) : undefined),
  (etapas, atual) => (atual ? etapas.find((e) => e.group === atual.group) : undefined),
  (etapas) => etapas.find((e) => e.default),
  (etapas) => etapas[0],
];

export function pickEtapaInicial(etapasDoDestino: EtapaDoSistema[], atual: EtapaAtual): EtapaDoSistema | null {
  const ordenadas = sortBySequence(etapasDoDestino);
  for (const criterio of CRITERIOS_DA_ETAPA_INICIAL) {
    const escolhida = criterio(ordenadas, atual);
    if (escolhida) return escolhida;
  }
  return null;
}

export const findEtapaCancelada = (etapas: EtapaDoSistema[]): EtapaDoSistema | null =>
  sortBySequence(etapas).find((e) => e.group === "cancelled") ?? null;

export type EtiquetaDaOrigem = { name: string; color: string };

export type PlanoDeEtiquetas = { existentes: string[]; criar: EtiquetaDaOrigem[] };

/** Casa as etiquetas por NOME: a do destino é reaproveitada, a que falta é criada uma vez só. */
export function buildPlanoDeEtiquetas(
  daOrigem: EtiquetaDaOrigem[],
  doDestino: Array<{ id: string; name: string }>
): PlanoDeEtiquetas {
  const destinoPorNome = new Map(doDestino.map((l) => [normalizeNome(l.name), l.id]));
  const vistos = new Set<string>();
  const plano: PlanoDeEtiquetas = { existentes: [], criar: [] };
  for (const etiqueta of daOrigem) {
    const nome = normalizeNome(etiqueta.name);
    if (vistos.has(nome)) continue;
    vistos.add(nome);
    const existente = destinoPorNome.get(nome);
    if (existente) {
      plano.existentes.push(existente);
      continue;
    }
    plano.criar.push({ name: etiqueta.name.trim(), color: etiqueta.color });
  }
  return plano;
}

export function requireDestinoValido(origemId: string, destino: unknown): string {
  const id = typeof destino === "string" ? destino.trim() : "";
  if (!id) throw createFieldError(CAMPO_DO_DESTINO, MENSAGENS_DE_ALTERAR_SISTEMA.destinoObrigatorio);
  if (id === origemId) throw createFieldError(CAMPO_DO_DESTINO, MENSAGENS_DE_ALTERAR_SISTEMA.mesmoSistema);
  return id;
}

export function requireNaoMovido(chamado: { movedToIssueId: string | null }): void {
  if (chamado.movedToIssueId) throw new DomainError(MENSAGENS_DE_ALTERAR_SISTEMA.jaMovido, 409);
}

export function requireEtapaCancelada(etapas: EtapaDoSistema[]): EtapaDoSistema {
  const cancelada = findEtapaCancelada(etapas);
  if (!cancelada) throw new DomainError(MENSAGENS_DE_ALTERAR_SISTEMA.semCancelados, 422);
  return cancelada;
}

export const buildIdentificador = (identifier: string, sequenceId: number) => `${identifier}-${sequenceId}`;
