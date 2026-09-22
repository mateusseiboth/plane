/**
 * Relatório de ligações: quantas, quantas perdidas, quantas concluídas, e a
 * contagem por atendente, por entidade (cliente) e por sistema.
 *
 * A agregação é pura e fica aqui; a leitura das linhas é do DAO.
 */

import type { LigacaoStatus } from "@/ligacoes/payload";

export type LinhaDoRelatorio = {
  status: LigacaoStatus;
  concluded: boolean;
  attendantId: string | null;
  entityId: string | null;
  entityName: string | null;
  projectId: string | null;
  projectName: string | null;
};

type Contagem = { id: string | null; name: string; count: number };

function countBy(
  linhas: LinhaDoRelatorio[],
  readId: (l: LinhaDoRelatorio) => string | null,
  readName: (l: LinhaDoRelatorio) => string | null,
  semNome: string
): Contagem[] {
  const grupos = new Map<string | null, Contagem>();
  for (const linha of linhas) {
    const id = readId(linha);
    const grupo = grupos.get(id) ?? { id, name: readName(linha) ?? semNome, count: 0 };
    grupo.count += 1;
    grupos.set(id, grupo);
  }
  return [...grupos.values()].toSorted((a, b) => b.count - a.count);
}

function countByAttendant(linhas: LinhaDoRelatorio[]) {
  const grupos = new Map<string | null, { id: string | null; count: number; missed: number }>();
  for (const linha of linhas) {
    const grupo = grupos.get(linha.attendantId) ?? { id: linha.attendantId, count: 0, missed: 0 };
    grupo.count += 1;
    grupo.missed += linha.status === "missed" ? 1 : 0;
    grupos.set(linha.attendantId, grupo);
  }
  return [...grupos.values()].toSorted((a, b) => b.count - a.count);
}

export function buildRelatorioDeLigacoes(linhas: LinhaDoRelatorio[]) {
  const missed = linhas.filter((l) => l.status === "missed").length;
  return {
    total: linhas.length,
    answered: linhas.length - missed,
    missed,
    concluded: linhas.filter((l) => l.concluded).length,
    by_attendant: countByAttendant(linhas),
    by_entity: countBy(
      linhas,
      (l) => l.entityId,
      (l) => l.entityName,
      "Sem entidade"
    ),
    by_system: countBy(
      linhas,
      (l) => l.projectId,
      (l) => l.projectName,
      "Sem sistema"
    ),
  };
}

export type RelatorioDeLigacoes = ReturnType<typeof buildRelatorioDeLigacoes>;
