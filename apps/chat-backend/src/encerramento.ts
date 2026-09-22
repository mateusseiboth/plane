/**
 * O que o atendente informa na hora de encerrar (`popChatAt_fimchatmot.php` do
 * SAC): para qual sistema era o suporte, a entidade (obrigatória), o tipo do
 * motivo, a funcionalidade (módulo do sistema, o antigo "menu do sistema"), a
 * observação e quem era a pessoa do outro lado.
 *
 * O cadastro nasce aqui porque é o único momento em que o atendente tem a
 * informação fresca — depois ninguém volta para completar. E ele nasce em
 * `entity_contacts` (Responsáveis), não num registro paralelo: é o mesmo
 * cadastro que a visita técnica e a entidade usam.
 *
 * O `Contact` do chat continua existindo e sendo atualizado — é o histórico da
 * conversa por telefone, não o cadastro do cliente.
 */

import prisma from "@db";
import { CAUSA_DO_FIM } from "@/ciclo-de-vida/abandono";
import { closeAtendimento } from "@/ciclo-de-vida/encerrar";
import { parseCatalogoDeMotivos, validateEncerramento } from "@/ciclo-de-vida/encerramento-regras";
import { buscarResponsavelPorId, salvarResponsavel, workspaceIdDoSlug, type Responsavel } from "@/responsaveis";

export type CadastroDoEncerramento = {
  /** Responsável já existente escolhido pelo atendente na busca. */
  contact_id?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  entity_id?: string | null;
  type_id?: string | null;
};

export type DadosDoEncerramento = {
  project_id?: string | null;
  contact?: CadastroDoEncerramento | null;
  entity_id?: string | null;
  /** Rótulo do tipo do motivo, do catálogo em BotConfig.closeReasons. */
  motivo?: string | null;
  /** Funcionalidade: módulo do sistema atendido. */
  module_id?: string | null;
  note?: string | null;
};

/** Erro de negócio do encerramento, com o status HTTP que a rota devolve. */
export class EncerramentoError extends Error {
  constructor(
    message: string,
    readonly status = 422
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const LIMITE_DA_OBSERVACAO = 2000;

type Sessao = {
  id: string;
  workspaceId: string;
  contactId: string | null;
  clientPhone: string | null;
  entityContactId: string | null;
  entityId: string | null;
  projectId: string | null;
  status: string;
};

async function readSessao(sessionId: string): Promise<Sessao> {
  const sessao = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      workspaceId: true,
      contactId: true,
      clientPhone: true,
      entityContactId: true,
      entityId: true,
      projectId: true,
      status: true,
    },
  });
  if (!sessao) throw new EncerramentoError("Atendimento não encontrado.", 404);
  if (sessao.status === "closed") throw new EncerramentoError("Este atendimento já foi encerrado.", 409);
  return sessao;
}

/** O histórico do chat acompanha o cadastro, para a lista mostrar o nome certo. */
async function updateHistoricoDoChat(contactId: string | null, responsavel: Responsavel) {
  if (!contactId) return;
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      name: responsavel.name,
      ...(responsavel.email ? { email: responsavel.email } : {}),
      ...(responsavel.entityId ? { entityId: responsavel.entityId } : {}),
    },
  });
}

async function saveResponsavel(
  sessao: Sessao,
  cadastro: CadastroDoEncerramento | null | undefined,
  atendenteId?: string | null
) {
  if (!cadastro) return null;
  const responsavel = await salvarResponsavel(
    sessao.workspaceId,
    {
      id: cadastro.contact_id ?? sessao.entityContactId ?? null,
      name: cadastro.name ?? null,
      email: cadastro.email ?? null,
      phone: cadastro.phone ?? sessao.clientPhone ?? null,
      entityId: cadastro.entity_id ?? null,
      typeId: cadastro.type_id ?? null,
    },
    atendenteId
  );
  if (!responsavel) return null;
  // O histórico antes do vínculo: quem espera o vínculo aparecer (a lista, os
  // testes) já encontra o contato do chat com o nome novo.
  await updateHistoricoDoChat(sessao.contactId, responsavel);
  await prisma.chatSession.updateMany({
    where: { id: sessao.id },
    data: { entityContactId: responsavel.id, clientName: responsavel.name },
  });
  return responsavel;
}

/** A entidade existe NESTE espaço? Id de outro espaço não entra no registro. */
async function hasEntidade(slug: string, entityId: string): Promise<boolean> {
  const workspaceId = await workspaceIdDoSlug(slug);
  if (!workspaceId) return false;
  const linhas = (await prisma.$queryRaw`
    SELECT 1 FROM entities WHERE id::text = ${entityId} AND workspace_id::text = ${workspaceId} AND deleted_at IS NULL LIMIT 1
  `) as unknown[];
  return linhas.length > 0;
}

/** O módulo tem de ser do sistema atendido: é a funcionalidade DAQUELE sistema. */
async function readModulo(moduleId: string, projectId: string | null): Promise<string> {
  const linhas = (await prisma.$queryRaw`
    SELECT name FROM modules
     WHERE id::text = ${moduleId} AND project_id::text = ${projectId ?? ""} AND deleted_at IS NULL
     LIMIT 1`) as Array<{ name: string }>;
  const modulo = linhas[0];
  if (!modulo) throw new EncerramentoError("A funcionalidade não pertence ao sistema atendido.");
  return modulo.name;
}

/**
 * Nome e sigla do sistema: o relatório por sistema lê `project_name`, e gravar
 * só o id deixava a conversa classificada sem aparecer no relatório.
 */
async function readSistema(slug: string, projectId: string) {
  const linhas = (await prisma.$queryRaw`
    SELECT p.id::text AS id, p.identifier, p.name
      FROM projects p JOIN workspaces w ON w.id = p.workspace_id
     WHERE w.slug = ${slug} AND p.id::text = ${projectId} AND p.deleted_at IS NULL
     LIMIT 1`) as Array<{ id: string; identifier: string; name: string }>;
  const sistema = linhas[0];
  if (!sistema) throw new EncerramentoError("Sistema não encontrado.");
  return { projectId: sistema.id, projectIdentifier: sistema.identifier, projectName: sistema.name };
}

/**
 * A entidade do contato já conhecido: quem o robô identificou pelo telefone,
 * ou quem o atendente escolheu na busca, já é de uma entidade. Pedir de novo
 * seria retrabalho.
 */
async function readEntidadeDoContato(slug: string, contactId: string | null | undefined): Promise<string | null> {
  if (!contactId) return null;
  return (await buscarResponsavelPorId(slug, contactId))?.entityId ?? null;
}

async function readCatalogo(workspaceId: string) {
  const cfg = await prisma.botConfig.findUnique({ where: { workspaceId }, select: { closeReasons: true } });
  return parseCatalogoDeMotivos(cfg?.closeReasons ?? []);
}

const readTexto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim().slice(0, LIMITE_DA_OBSERVACAO) : null;

/**
 * Valida, grava a classificação e o cadastro e só então encerra: a mensagem de
 * encerramento sai logo em seguida e o dado precisa já existir quando ela sair.
 * Nada é gravado se a validação recusar.
 */
export async function closeWithEncerramento(
  sessionId: string,
  dados: DadosDoEncerramento,
  atendenteId?: string | null
) {
  const sessao = await readSessao(sessionId);
  const projectId = dados.project_id || sessao.projectId;
  const motivo = readTexto(dados.motivo);
  const entidadeInformada = dados.entity_id || dados.contact?.entity_id || null;

  const entidadeConhecida =
    sessao.entityId ??
    (await readEntidadeDoContato(sessao.workspaceId, dados.contact?.contact_id ?? sessao.entityContactId));

  const erro = validateEncerramento({
    entityId: entidadeInformada ?? entidadeConhecida,
    motivo,
    catalogo: await readCatalogo(sessao.workspaceId),
  });
  if (erro) throw new EncerramentoError(erro);
  if (entidadeInformada && !(await hasEntidade(sessao.workspaceId, entidadeInformada)))
    throw new EncerramentoError("Entidade não encontrada.");
  const sistema = dados.project_id ? await readSistema(sessao.workspaceId, dados.project_id) : {};
  const nomeDoModulo = dados.module_id ? await readModulo(dados.module_id, projectId) : null;

  const responsavel = await saveResponsavel(sessao, dados.contact, atendenteId);
  await prisma.chatSession.updateMany({
    where: { id: sessionId },
    data: {
      ...sistema,
      entityId: entidadeInformada ?? responsavel?.entityId ?? entidadeConhecida,
      closeReason: motivo,
      closeModuleId: dados.module_id || null,
      closeModuleName: nomeDoModulo,
      closeNote: readTexto(dados.note),
    },
  });
  return closeAtendimento({ sessionId, causa: CAUSA_DO_FIM.ATENDENTE, closedById: atendenteId ?? null });
}
