// Notification helpers (D3).
import prisma from "@db";

/**
 * Notify all Quality-team members of a project that a new intake was opened.
 * Quality membership = legacy role level 8 OR a workflowRole keyed "qualidade".
 * The actor (creator) is never notified about their own intake.
 */
export async function notifyQualityOfIntake(opts: {
  workspaceId: string;
  projectId: string;
  issueId: string;
  actorId: string;
  issueName: string;
}): Promise<void> {
  const members = await prisma.projectMember.findMany({
    where: {projectId: opts.projectId, isActive: true, deletedAt: null},
    include: {workflowRole: {select: {key: true, level: true}}},
  });

  const receivers = members
    .filter((m) => m.memberId !== opts.actorId)
    .filter((m) => m.workflowRole?.key === "qualidade" || m.workflowRole?.level === 8 || m.role === 8)
    .map((m) => m.memberId);

  if (!receivers.length) return;

  await prisma.notification.createMany({
    data: receivers.map((receiverId) => ({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      issueId: opts.issueId,
      receiverId,
      actorId: opts.actorId,
      title: "Novo intake aberto",
      message: opts.issueName,
      entity: "intake",
      entityId: opts.issueId,
      data: {type: "intake_opened"},
      triggered: "intake",
    })),
  });
}

/**
 * Avisa quem precisa agir quando o chamado muda de etapa.
 *
 * O quadro só conta a história para quem está olhando: o TI mandava para Em
 * Teste e a Qualidade não ficava sabendo; a Qualidade devolvia com erro e o
 * desenvolvedor descobria por acaso.
 *
 * Quem é avisado:
 *
 *   1. os RESPONSÁVEIS do chamado — quem está com ele precisa saber que andou;
 *   2. se nenhum responsável for do setor que trabalha na etapa de destino, o
 *      setor inteiro, para o chamado não ficar parado esperando alguém reparar.
 *
 * O setor dono de uma etapa não é cravado aqui: é lido das transições
 * configuradas em Funções — dono é quem tem permissão de SAIR daquela etapa.
 * Só a Qualidade sai de "Em Teste"; só o TI sai de "Em Desenvolvimento". Assim
 * mexer nas regras pela tela muda o destinatário junto, sem tocar no código.
 */
export async function notifyStateChange(opts: {
  workspaceId: string;
  projectId: string;
  issueId: string;
  actorId: string;
  issueName: string;
  fromState: string;
  toState: string;
}): Promise<void> {
  if (opts.fromState === opts.toState) return;

  const donos = await prisma.roleStateTransition.findMany({
    where: {workspaceId: opts.workspaceId, allowed: true, fromStateName: opts.toState},
    select: {roleId: true},
  });
  const idsDosDonos = new Set(donos.map((d) => d.roleId));

  const membros = await prisma.projectMember.findMany({
    where: {projectId: opts.projectId, isActive: true, deletedAt: null},
    select: {memberId: true, workflowRoleId: true},
  });
  const doSetorDaEtapa = new Set(
    membros.filter((m) => m.workflowRoleId && idsDosDonos.has(m.workflowRoleId)).map((m) => m.memberId)
  );

  const responsaveis = (
    await prisma.issueAssignee.findMany({
      where: {issueId: opts.issueId, deletedAt: null},
      select: {assigneeId: true},
    })
  ).map((a) => a.assigneeId);

  const destinatarios = new Set(responsaveis);
  const algumResponsavelDoSetor = responsaveis.some((id) => doSetorDaEtapa.has(id));
  if (!algumResponsavelDoSetor) for (const id of doSetorDaEtapa) destinatarios.add(id);
  destinatarios.delete(opts.actorId);
  if (!destinatarios.size) return;

  // Conta desativada não recebe aviso. A migração deixou contatos externos como
  // responsáveis de chamados antigos: sem este filtro, gente que nem entra no
  // sistema acumulava notificação de trabalho alheio.
  const ativos = await prisma.user.findMany({
    where: {id: {in: [...destinatarios]}, isActive: true, deletedAt: null},
    select: {id: true},
  });
  if (!ativos.length) return;

  await prisma.notification.createMany({
    data: ativos.map(({id: receiverId}) => ({
      workspaceId: opts.workspaceId,
      projectId: opts.projectId,
      issueId: opts.issueId,
      receiverId,
      actorId: opts.actorId,
      title: `${opts.fromState} → ${opts.toState}`,
      message: opts.issueName,
      entity: "issue",
      entityId: opts.issueId,
      data: {type: "state_changed", from: opts.fromState, to: opts.toState},
      triggered: "state",
    })),
  });
}
