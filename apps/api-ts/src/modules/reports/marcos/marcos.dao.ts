/**
 * DAO dos marcos por etapa: histórico de etapa (`issue_activities` field=state),
 * atribuições e o grupo de cada etapa pelo nome. Só acesso a dados; a regra dos
 * marcos mora em `marcos.ts`. O relatório "tempo em cada etapa" lê o mesmo histórico.
 */
import prisma from "@db";
import type { Atribuicao, GrupoDaEtapa, TransicaoDeEtapa } from "@modules/reports/marcos/marcos";

function groupPorChamado<L extends { issueId: string }, T>(linhas: L[], map: (linha: L) => T): Map<string, T[]> {
  const porChamado = new Map<string, T[]>();
  for (const linha of linhas) porChamado.set(linha.issueId, [...(porChamado.get(linha.issueId) ?? []), map(linha)]);
  return porChamado;
}

/** Histórico de etapa por chamado, do mais antigo para o mais recente. */
export async function findTransicoesDeEtapa(issueIds: string[]): Promise<Map<string, TransicaoDeEtapa[]>> {
  if (!issueIds.length) return new Map();
  const linhas = await prisma.issueActivity.findMany({
    where: { issueId: { in: issueIds }, field: "state", deletedAt: null },
    select: { issueId: true, oldValue: true, newValue: true, createdAt: true, actorId: true },
    orderBy: { createdAt: "asc" },
  });
  return groupPorChamado(linhas, (l) => ({ de: l.oldValue, para: l.newValue, em: l.createdAt, por: l.actorId }));
}

/**
 * Atribuições por chamado e os responsáveis de agora. As atribuições incluem
 * vínculo já desfeito: "atribuído" é quando o chamado ganhou dono pela primeira
 * vez, mesmo que o dono tenha mudado depois.
 */
export async function findAtribuicoes(issueIds: string[]) {
  if (!issueIds.length)
    return { atribuicoes: new Map<string, Atribuicao[]>(), responsaveis: new Map<string, string[]>() };
  const linhas = await prisma.issueAssignee.findMany({
    where: { issueId: { in: issueIds } },
    select: { issueId: true, assigneeId: true, createdAt: true, deletedAt: true },
    orderBy: { createdAt: "asc" },
  });
  const atuais = groupPorChamado(
    linhas.filter((l) => !l.deletedAt),
    (l) => l.assigneeId
  );
  return {
    atribuicoes: groupPorChamado(linhas, (l): Atribuicao => ({ usuarioId: l.assigneeId, em: l.createdAt })),
    responsaveis: new Map([...atuais].map(([issueId, ids]) => [issueId, [...new Set(ids)]])),
  };
}

/** Grupo de cada etapa pelo nome, a partir das etapas do espaço (o histórico só guarda o nome). */
export async function findGrupoDaEtapa(workspaceId: string): Promise<GrupoDaEtapa> {
  const etapas = await prisma.state.findMany({ where: { workspaceId }, select: { name: true, group: true } });
  const grupos = new Map<string, string>();
  for (const etapa of etapas) if (!grupos.has(etapa.name)) grupos.set(etapa.name, etapa.group);
  return (nome) => (nome ? (grupos.get(nome) ?? null) : null);
}
