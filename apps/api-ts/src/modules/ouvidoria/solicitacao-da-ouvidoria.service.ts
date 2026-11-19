/**
 * Cria a solicitação a partir de uma ouvidoria: nasce No atendimento,
 * atribuída ao atendente escolhido, com o relato da ouvidoria na descrição e a
 * entidade dela. A ouvidoria guarda o vínculo e passa a mostrar o processo.
 * Regras em `solicitacao-da-ouvidoria.rules.ts`.
 */
import prisma from "@db";
import { ouvidoriaDao } from "@modules/ouvidoria/ouvidoria.dao";
import {
  MENSAGEM_JA_TEM_SOLICITACAO,
  buildDescricaoDaOuvidoria,
  buildTituloDaOuvidoria,
  requireAtendente,
} from "@modules/ouvidoria/solicitacao-da-ouvidoria.rules";
import { isUuid } from "@modules/portal/conta";
import { DomainError, NotFoundError } from "@utils/erro-de-dominio";
import { createFieldError } from "@utils/field-error";
import { createSolicitacao, requireSistemaDoEspaco } from "@utils/intake";
import { EProjectAction, resolveMemberRole, roleCan } from "@utils/permission-checks";

type Pedido = {
  workspaceId: string;
  ouvidoriaId: string;
  user: { id: string; email?: string | null };
  corpo: { project_id?: unknown; atendente_id?: unknown; titulo?: unknown };
  headers?: Record<string, string | undefined>;
};

/** O atendente precisa ser membro ativo do espaço com a ação de abrir solicitação. */
const isAtendenteValido = async (workspaceId: string, atendenteId: unknown): Promise<boolean> => {
  if (typeof atendenteId !== "string" || !isUuid(atendenteId)) return false;
  const membro = await prisma.workspaceMember.findFirst({
    where: { workspaceId, memberId: atendenteId, isActive: true, deletedAt: null },
  });
  if (!membro) return false;
  return roleCan(await resolveMemberRole(workspaceId, membro as any), EProjectAction.INTAKE_CREATE);
};

export async function createSolicitacaoDaOuvidoria(pedido: Pedido): Promise<{ issue_id: string }> {
  const { workspaceId, ouvidoriaId, user, corpo, headers } = pedido;
  const ouvidoria = await ouvidoriaDao.findOne(workspaceId, ouvidoriaId);
  if (!ouvidoria) throw new NotFoundError("Registro da ouvidoria não encontrado.");
  if (ouvidoria.solicitacaoIssueId) throw new DomainError(MENSAGEM_JA_TEM_SOLICITACAO, 409);

  const projectId = typeof corpo.project_id === "string" ? corpo.project_id : "";
  if (!isUuid(projectId)) throw createFieldError("project_id", "Escolha o sistema.");
  await requireSistemaDoEspaco(projectId, workspaceId);
  requireAtendente(await isAtendenteValido(workspaceId, corpo.atendente_id));

  const issue = await createSolicitacao({
    workspaceId,
    projectId,
    user,
    name: buildTituloDaOuvidoria(ouvidoria, corpo.titulo),
    descriptionHtml: buildDescricaoDaOuvidoria(ouvidoria),
    entityId: ouvidoria.entityId,
    atendenteId: corpo.atendente_id as string,
    externalSource: "ouvidoria",
    externalId: ouvidoria.id,
    headers,
    auditMetadata: { origem: "ouvidoria", ouvidoria_id: ouvidoria.id },
  });
  await ouvidoriaDao.linkSolicitacao(ouvidoria.id, issue.id);
  return { issue_id: issue.id };
}
