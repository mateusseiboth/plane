/**
 * Função (WorkflowRole) de cada membro do espaço, para os relatórios que agrupam
 * ou filtram por setor (log consolidado, painel de TV). Mesma resolução de
 * `resolveRole` (@utils/permission-checks): a função gravada no vínculo, senão a
 * função do espaço com o nível do vínculo, senão o padrão em memória.
 *
 * Aqui só se descobre O NOME da função para exibir e agrupar; permissão continua
 * sendo checada pela matriz de ações.
 */
import prisma from "@db";
import { DEFAULT_ROLES, defaultRoleForLevel } from "@utils/permissions";

export type FuncaoDoMembro = { key: string; nome: string };

type FuncaoGravada = { id: string; key: string; name: string; level: number };
type Vinculo = { memberId: string; role: number; workflowRoleId: string | null };

export function resolveFuncaoDoMembro(vinculo: Vinculo, gravadas: FuncaoGravada[]): FuncaoDoMembro {
  const gravada =
    gravadas.find((f) => f.id === vinculo.workflowRoleId) ?? gravadas.find((f) => f.level === vinculo.role);
  if (gravada) return { key: gravada.key, nome: gravada.name };
  const padrao = defaultRoleForLevel(vinculo.role);
  return { key: padrao.key, nome: padrao.name };
}

async function findFuncoesGravadas(workspaceId: string): Promise<FuncaoGravada[]> {
  return prisma.workflowRole.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, key: true, name: true, level: true },
  });
}

export async function findFuncoesDosMembros(workspaceId: string): Promise<Map<string, FuncaoDoMembro>> {
  const [vinculos, gravadas] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId, deletedAt: null },
      select: { memberId: true, role: true, workflowRoleId: true },
    }),
    findFuncoesGravadas(workspaceId),
  ]);
  return new Map(vinculos.map((v) => [v.memberId, resolveFuncaoDoMembro(v, gravadas)]));
}

/** As funções que o espaço conhece, para o filtro da tela. */
export async function findFuncoesDoEspaco(workspaceId: string): Promise<FuncaoDoMembro[]> {
  const gravadas = await findFuncoesGravadas(workspaceId);
  const lista = gravadas.length ? gravadas : DEFAULT_ROLES;
  return lista.map((f) => ({ key: f.key, nome: f.name }));
}
