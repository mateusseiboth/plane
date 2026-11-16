/**
 * Todo membro ativo do espaço participa de todos os sistemas, como no legado:
 * ninguém do time ficava preso a um sistema, e o que cada um pode FAZER vem da
 * matriz de Funções. Pedido do dono em 16/11/2026, depois que a importação
 * deixou o desenvolvedor principal do ARH sem acesso ao próprio sistema.
 *
 * O vínculo é gravado em `project_members` (não virtual) porque os avisos do
 * sino leem essa tabela: a Qualidade do sistema e o setor dono da etapa.
 *
 * Idempotente. Só CRIA o que falta: vínculo desativado continua desativado,
 * para que tirar alguém de um sistema pela tela não seja desfeito sozinho.
 */
import prisma from "@db";

type Membro = { memberId: string; role: number; workflowRoleId: string | null };
type Vinculo = { projectId: string; memberId: string };

const buildChave = (projectId: string, memberId: string) => `${projectId}:${memberId}`;

/** Os vínculos que faltam: cada membro em cada sistema, com o nível e a função dele no espaço. */
export const buildVinculosQueFaltam = (
  workspaceId: string,
  membros: Membro[],
  sistemaIds: string[],
  existentes: Vinculo[]
) => {
  const jaGravados = new Set(existentes.map((v) => buildChave(v.projectId, v.memberId)));
  return sistemaIds.flatMap((projectId) =>
    membros
      .filter((membro) => !jaGravados.has(buildChave(projectId, membro.memberId)))
      .map((membro) => ({
        projectId,
        workspaceId,
        memberId: membro.memberId,
        role: membro.role,
        workflowRoleId: membro.workflowRoleId,
        isActive: true,
      }))
  );
};

const findMembrosAtivos = (workspaceId: string) =>
  prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      isActive: true,
      deletedAt: null,
      member: { isActive: true, deletedAt: null, isBotUser: false },
    },
    select: { memberId: true, role: true, workflowRoleId: true },
  });

const findSistemaIds = async (workspaceId: string) =>
  (await prisma.project.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true } })).map((p) => p.id);

/** Todo vínculo vivo, ativo ou não: o desativado não é recriado. */
const findVinculosExistentes = (workspaceId: string) =>
  prisma.projectMember.findMany({
    where: { workspaceId, deletedAt: null },
    select: { projectId: true, memberId: true },
  });

const LOTE = 500;

/** Grava o que falta e devolve quantos vínculos foram criados. */
export async function syncParticipacaoEmTodoSistema(workspaceId: string): Promise<number> {
  const [membros, sistemaIds, existentes] = await Promise.all([
    findMembrosAtivos(workspaceId),
    findSistemaIds(workspaceId),
    findVinculosExistentes(workspaceId),
  ]);
  const faltam = buildVinculosQueFaltam(workspaceId, membros, sistemaIds, existentes);
  const lotes = Array.from({ length: Math.ceil(faltam.length / LOTE) }, (_, i) =>
    faltam.slice(i * LOTE, (i + 1) * LOTE)
  );
  const criados = await Promise.all(
    lotes.map((data) => prisma.projectMember.createMany({ data, skipDuplicates: true }))
  );
  return criados.reduce((total, lote) => total + lote.count, 0);
}
